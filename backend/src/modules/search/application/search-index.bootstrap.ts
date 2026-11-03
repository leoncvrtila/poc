import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { errorMessage } from '../../../shared/util/error-message';
import { ProductIndexWriter } from '../domain/ports';

/** Applies index settings at startup. Non-fatal: the outbox retries until Meilisearch is reachable. */
@Injectable()
export class SearchIndexBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(SearchIndexBootstrap.name);

  constructor(private readonly index: ProductIndexWriter) {}

  onApplicationBootstrap(): void {
    // Fire and forget: a slow or unreachable Meilisearch must not delay startup.
    void this.index
      .ensureReady()
      .catch((error: unknown) => this.logger.warn(`Search index not ready yet: ${errorMessage(error)}`));
  }
}
