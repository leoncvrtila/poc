import { Injectable } from '@nestjs/common';
import { CatalogFacade } from '../../../catalog';
import { ReviewsFacade } from '../../../reviews';
import { errorMessage } from '../../../../shared/util/error-message';
import { buildFacets } from '../../application/facets';
import { ProductSearchEngine, SearchUnavailableError } from '../../domain/ports';
import { toProductDocument, toSearchItem } from '../../domain/product-document';
import type { ProductSearchQuery } from '../../domain/search-query';
import { browsablePages, type ProductSearchResult } from '../../domain/search-result';

/** Fallback engine: answers from Postgres through the catalog, without typo tolerance or Meilisearch ranking. */
@Injectable()
export class CatalogBackedSearch extends ProductSearchEngine {
  constructor(
    private readonly catalog: CatalogFacade,
    private readonly reviews: ReviewsFacade,
  ) {
    super();
  }

  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    try {
      const page = await this.catalog.searchProducts({
        q: query.q,
        filters: query.filters,
        // Ratings live in the reviews module, so the catalog cannot sort by them.
        sort: query.sort === '-rating' ? 'name' : query.sort,
        page: query.page,
        pageSize: query.pageSize,
      });
      const ratings = await this.reviews.getRatingSummaries(page.items.map((product) => product.sku));
      return {
        items: page.items.map((product) => toSearchItem(toProductDocument(product, ratings.get(product.sku)))),
        page: query.page,
        pageSize: query.pageSize,
        total: page.total,
        totalPages: browsablePages(page.total, query.pageSize),
        facets: buildFacets(page.facetCounts, query.filters),
        degraded: true,
      };
    } catch (error) {
      throw new SearchUnavailableError(`Fallback search failed: ${errorMessage(error)}`, { cause: error });
    }
  }
}
