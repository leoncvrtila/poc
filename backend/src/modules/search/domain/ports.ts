import type { ProductDocument } from './product-document';
import type { ProductSearchQuery } from './search-query';
import type { ProductSearchResult } from './search-result';

/** Read side. A different engine (e.g. Postgres FTS, OpenSearch) only needs a new adapter. */
export abstract class ProductSearchEngine {
  abstract search(query: ProductSearchQuery): Promise<ProductSearchResult>;
}

/** Write side, used by the outbox handlers and the reindex command. */
export abstract class ProductIndexWriter {
  abstract ensureReady(): Promise<void>;
  abstract upsert(documents: ProductDocument[]): Promise<void>;
  abstract remove(skus: string[]): Promise<void>;
  abstract rebuild(batches: AsyncIterable<ProductDocument[]>): Promise<number>;
  abstract countDocuments(): Promise<number>;
}

export class SearchUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SearchUnavailableError';
  }
}
