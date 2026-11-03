import type { ProductStatus } from '../../catalog';
import type { FacetName } from './search-query';

export interface ProductSearchItem {
  sku: string;
  displayName: string;
  chemicalName: string;
  function: string;
  applicationArea: string;
  region: string;
  certifications: string[];
  status: ProductStatus;
  launchYear: number | null;
  ratingAverage: number | null;
  reviewCount: number;
}

export interface FacetValue {
  value: string;
  count: number;
  selected: boolean;
}

/** Results a search can page through: Meilisearch serves at most this many hits, and the fallback keeps the same window. */
export const MAX_RESULT_WINDOW = 10_000;

/** Pages a client may request; `total` can promise more than the result window serves. */
export function browsablePages(total: number, pageSize: number): number {
  return Math.min(Math.ceil(total / pageSize), Math.ceil(MAX_RESULT_WINDOW / pageSize));
}

export interface ProductSearchResult {
  items: ProductSearchItem[];
  page: number;
  pageSize: number;
  total: number;
  /** Pages inside the result window, so possibly fewer than `total / pageSize`. */
  totalPages: number;
  facets: Record<FacetName, FacetValue[]>;
  /** true when served by the Postgres fallback because Meilisearch is unavailable. */
  degraded: boolean;
}
