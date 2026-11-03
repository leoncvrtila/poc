import type { ProductStatus } from '../../catalog';

export const FACETS = ['function', 'applicationArea', 'region', 'status', 'certification'] as const;
export type FacetName = (typeof FACETS)[number];

export const SORT_OPTIONS = ['relevance', 'name', '-launchYear', '-rating'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

/** Discontinued products are hidden unless the customer explicitly asks for them. */
export const DEFAULT_STATUSES: ProductStatus[] = ['ACTIVE', 'PHASE_OUT'];

export type SearchFilters = Record<FacetName, string[]>;

export interface ProductSearchQuery {
  q: string;
  filters: SearchFilters;
  sort: SortOption;
  page: number;
  pageSize: number;
}
