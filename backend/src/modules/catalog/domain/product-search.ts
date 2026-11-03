import type { ProductView } from './product';

export const CATALOG_SEARCH_FACETS = ['function', 'applicationArea', 'region', 'status', 'certification'] as const;
export type CatalogSearchFacet = (typeof CATALOG_SEARCH_FACETS)[number];

export interface CatalogSearchCriteria {
  q: string;
  /** OR within a facet, AND across facets; certifications: the product must have every selected one. */
  filters: Record<CatalogSearchFacet, string[]>;
  sort: 'relevance' | 'name' | '-launchYear';
  page: number;
  pageSize: number;
}

export interface CatalogSearchPage {
  items: ProductView[];
  total: number;
  /** Per facet: counted with every filter except that facet's own (certification: with all filters). */
  facetCounts: Record<CatalogSearchFacet, Record<string, number>>;
}
