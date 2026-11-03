import { Inject, Injectable } from '@nestjs/common';
import type { ProductDocument } from '../../domain/product-document';
import { ProductIndexWriter } from '../../domain/ports';
import { MEILI_INDEX } from '../../search.tokens';
import { MeiliClient, MeiliError } from './meili-client';
import { PRODUCT_INDEX_SETTINGS } from './meili-settings';

@Injectable()
export class MeiliProductIndex extends ProductIndexWriter {
  private ready: Promise<void> | undefined;

  constructor(
    private readonly client: MeiliClient,
    @Inject(MEILI_INDEX) private readonly index: string,
  ) {
    super();
  }

  ensureReady(): Promise<void> {
    this.ready ??= this.prepare(this.index).catch((error: unknown) => {
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }

  async upsert(documents: ProductDocument[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }
    await this.guarded(() => this.client.runTask('POST', `/indexes/${this.index}/documents?primaryKey=sku`, documents));
  }

  async remove(skus: string[]): Promise<void> {
    if (skus.length === 0) {
      return;
    }
    await this.guarded(() => this.client.runTask('POST', `/indexes/${this.index}/documents/delete-batch`, skus));
  }

  async countDocuments(): Promise<number> {
    try {
      const stats = await this.client.request<{ numberOfDocuments: number }>('GET', `/indexes/${this.index}/stats`);
      return stats.numberOfDocuments;
    } catch (error) {
      if (error instanceof MeiliError && error.code === 'index_not_found') {
        return 0;
      }
      throw error;
    }
  }

  /** A failed write may mean the index was wiped, so forget the memo and let the retry recreate index + settings. */
  private async guarded(write: () => Promise<unknown>): Promise<void> {
    await this.ensureReady();
    try {
      await write();
    } catch (error) {
      this.ready = undefined;
      throw error;
    }
  }

  /** Builds a fresh index next to the live one and swaps them, so search never sees a half-built index. */
  async rebuild(batches: AsyncIterable<ProductDocument[]>): Promise<number> {
    await this.ensureReady();
    const staging = `${this.index}_rebuild`;
    await this.deleteIndexIfExists(staging);
    await this.prepare(staging);

    let count = 0;
    for await (const documents of batches) {
      if (documents.length > 0) {
        await this.client.runTask('POST', `/indexes/${staging}/documents?primaryKey=sku`, documents);
        count += documents.length;
      }
    }

    await this.client.runTask('POST', '/swap-indexes', [{ indexes: [this.index, staging] }]);
    await this.deleteIndexIfExists(staging);
    return count;
  }

  private async prepare(uid: string): Promise<void> {
    try {
      await this.client.runTask('POST', '/indexes', { uid, primaryKey: 'sku' });
    } catch (error) {
      if (!(error instanceof MeiliError && error.code === 'index_already_exists')) {
        throw error;
      }
    }
    await this.client.runTask('PATCH', `/indexes/${uid}/settings`, PRODUCT_INDEX_SETTINGS);
  }

  private async deleteIndexIfExists(uid: string): Promise<void> {
    try {
      await this.client.runTask('DELETE', `/indexes/${uid}`);
    } catch (error) {
      if (!(error instanceof MeiliError && error.code === 'index_not_found')) {
        throw error;
      }
    }
  }
}
