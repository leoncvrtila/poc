import { Inject, Injectable, Logger } from '@nestjs/common';
import { buildFacets, type FacetDistributions } from '../../application/facets';
import { ProductSearchEngine, SearchUnavailableError } from '../../domain/ports';
import { type ProductDocument, toSearchItem } from '../../domain/product-document';
import { FACETS, type ProductSearchQuery } from '../../domain/search-query';
import { browsablePages, type ProductSearchResult } from '../../domain/search-result';
import { MEILI_INDEX } from '../../search.tokens';
import { MeiliClient, MeiliError } from './meili-client';
import { buildFilter, DISJUNCTIVE_FACETS, FACET_ATTRIBUTES, toMeiliSort } from './meili-query';

interface MeiliHits {
  hits: ProductDocument[];
  totalHits?: number;
  totalPages?: number;
  facetDistribution?: Record<string, Record<string, number>>;
}

/** A user should not wait 30 s before the fallback answers. */
const SEARCH_TIMEOUT_MS = 2_000;

/** Meilisearch splits "P-10004" into "p" + "10004"; the default strategy would then match everything on "p". */
const SKU_LIKE = /^p[-\s]?\d+$/i;

/** Statuses that mean "Meilisearch cannot serve us" (bad key, missing index, throttled) rather than "our request is invalid". */
const UNAVAILABLE_STATUSES = new Set([401, 403, 404, 429]);

/** Network errors and timeouts (no status), server errors and the statuses above fall back to Postgres. */
function isAvailabilityFailure(error: MeiliError): boolean {
  return error.status === null || error.status >= 500 || UNAVAILABLE_STATUSES.has(error.status);
}

const RETRIEVED_ATTRIBUTES = [
  'sku',
  'displayName',
  'chemicalName',
  'function',
  'applicationArea',
  'region',
  'certifications',
  'status',
  'launchYear',
  'ratingAverage',
  'reviewCount',
];

@Injectable()
export class MeiliProductSearch extends ProductSearchEngine {
  private readonly logger = new Logger(MeiliProductSearch.name);

  constructor(
    private readonly client: MeiliClient,
    @Inject(MEILI_INDEX) private readonly index: string,
  ) {
    super();
  }

  async search(query: ProductSearchQuery): Promise<ProductSearchResult> {
    const matchingStrategy = SKU_LIKE.test(query.q.trim()) ? 'all' : 'last';
    const disjunctive = DISJUNCTIVE_FACETS.filter((facet) => query.filters[facet].length > 0);
    const queries = [
      {
        indexUid: this.index,
        q: query.q,
        matchingStrategy,
        filter: buildFilter(query.filters),
        facets: FACETS.map((facet) => FACET_ATTRIBUTES[facet]),
        sort: toMeiliSort(query.sort),
        page: query.page,
        hitsPerPage: query.pageSize,
        attributesToRetrieve: RETRIEVED_ATTRIBUTES,
      },
      // One extra query per active OR-facet: counts as if that facet's own selection were not applied.
      ...disjunctive.map((facet) => ({
        indexUid: this.index,
        q: query.q,
        matchingStrategy,
        filter: buildFilter(query.filters, facet),
        facets: [FACET_ATTRIBUTES[facet]],
        limit: 0,
      })),
    ];

    let results: MeiliHits[];
    try {
      ({ results } = await this.client.request<{ results: MeiliHits[] }>(
        'POST',
        '/multi-search',
        { queries },
        {
          timeoutMs: SEARCH_TIMEOUT_MS,
        },
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof MeiliError ? ` (${error.code ?? error.status ?? 'no code'})` : '';
      this.logger.warn(`Meilisearch search failed${code}: ${message}`);
      if (error instanceof MeiliError && !isAvailabilityFailure(error)) {
        // Our own request is wrong (e.g. an invalid query): surface the bug instead of hiding it behind the fallback.
        throw error;
      }
      throw new SearchUnavailableError(message, { cause: error });
    }

    const [main, ...perFacet] = results;
    const distributions = {} as FacetDistributions;
    for (const facet of FACETS) {
      distributions[facet] = main.facetDistribution?.[FACET_ATTRIBUTES[facet]] ?? {};
    }
    disjunctive.forEach((facet, index) => {
      distributions[facet] = perFacet[index].facetDistribution?.[FACET_ATTRIBUTES[facet]] ?? {};
    });

    const total = main.totalHits ?? 0;
    return {
      items: main.hits.map(toSearchItem),
      page: query.page,
      pageSize: query.pageSize,
      total,
      // Meilisearch reports the full totalHits but serves only the result window.
      totalPages: browsablePages(total, query.pageSize),
      facets: buildFacets(distributions, query.filters),
      degraded: false,
    };
  }
}
