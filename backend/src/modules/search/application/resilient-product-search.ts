import { Logger } from '@nestjs/common';
import { ProductSearchEngine, SearchUnavailableError } from '../domain/ports';
import type { ProductSearchQuery } from '../domain/search-query';
import type { ProductSearchResult } from '../domain/search-result';

/** After a Meilisearch failure, serve from the fallback for this long before trying Meilisearch again. */
export const FALLBACK_WINDOW_MS = 30_000;

/** Meilisearch first; while it is unavailable, the Postgres fallback (limited relevance, `degraded: true`). */
export class ResilientProductSearch extends ProductSearchEngine {
  private readonly logger = new Logger(ResilientProductSearch.name);
  /** 0 while Meilisearch is healthy; otherwise the time until which requests skip it. */
  private primaryDownUntil = 0;

  constructor(
    private readonly primary: ProductSearchEngine,
    private readonly fallback: ProductSearchEngine,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    const now = this.now();
    if (now >= this.primaryDownUntil) {
      const recovering = this.primaryDownUntil > 0;
      if (recovering) {
        // Claim the probe before awaiting: concurrent requests keep using the fallback meanwhile.
        this.primaryDownUntil = now + FALLBACK_WINDOW_MS;
      }
      try {
        const result = await this.primary.search(query);
        if (recovering) {
          this.primaryDownUntil = 0;
          this.logger.log('Meilisearch is available again; leaving limited search mode');
        }
        return result;
      } catch (error) {
        if (!(error instanceof SearchUnavailableError)) {
          throw error;
        }
        if (!recovering) {
          this.logger.warn(`Meilisearch unavailable, serving limited search from Postgres: ${error.message}`);
        }
        this.primaryDownUntil = this.now() + FALLBACK_WINDOW_MS;
      }
    }
    return this.fallback.search(query);
  }
}
