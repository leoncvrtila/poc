import { Injectable } from '@nestjs/common';
import { CatalogFacade, type ProductView } from '../../catalog';
import { ReviewsFacade } from '../../reviews';
import { ProductIndexWriter } from '../domain/ports';
import { type ProductDocument, toProductDocument } from '../domain/product-document';

@Injectable()
export class SearchIndexer {
  constructor(
    private readonly catalog: CatalogFacade,
    private readonly reviews: ReviewsFacade,
    private readonly index: ProductIndexWriter,
  ) {}

  /** Idempotent: reads current state, upserts listed products, removes everything else. */
  async syncProducts(skus: string[]): Promise<void> {
    const unique = [...new Set(skus)];
    const products = await this.catalog.findBySkus(unique);
    const listed = products.filter((product) => product.listed);
    const listedSkus = new Set(listed.map((product) => product.sku));

    await this.index.upsert(await this.toDocuments(listed));
    await this.index.remove(unique.filter((sku) => !listedSkus.has(sku)));
  }

  async rebuildAll(): Promise<number> {
    return this.index.rebuild(this.allDocuments());
  }

  /** Compares what the catalogue lists with what the index holds; they differ when events were lost or dead-lettered. */
  async verify(): Promise<{ listedProducts: number; indexedDocuments: number }> {
    const [status, indexedDocuments] = await Promise.all([this.catalog.getStatus(), this.index.countDocuments()]);
    return { listedProducts: status.listedProducts, indexedDocuments };
  }

  private async *allDocuments(): AsyncGenerator<ProductDocument[]> {
    for await (const batch of this.catalog.listedProducts(1000)) {
      yield await this.toDocuments(batch);
    }
  }

  private async toDocuments(products: ProductView[]): Promise<ProductDocument[]> {
    const ratings = await this.reviews.getRatingSummaries(products.map((product) => product.sku));
    return products.map((product) => toProductDocument(product, ratings.get(product.sku)));
  }
}
