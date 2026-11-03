export type ProductStatus = 'ACTIVE' | 'PHASE_OUT' | 'DISCONTINUED';
export type FacetName = 'function' | 'applicationArea' | 'region' | 'status' | 'certification';
export type SortOption = 'relevance' | 'name' | '-launchYear' | '-rating';

export interface ProductSummary {
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

export interface SearchResponse {
  items: ProductSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** True when search was served from the database fallback because the search engine is down. */
  degraded: boolean;
  facets: Record<FacetName, FacetValue[]>;
}

export interface ProductDetail {
  sku: string;
  name: string | null;
  displayName: string;
  chemicalName: string;
  function: string;
  applicationArea: string;
  region: string;
  certifications: string[];
  status: ProductStatus;
  launchYear: number | null;
  description: string;
  listed: boolean;
  updatedAt: string;
}

export interface Review {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export type StarRating = 1 | 2 | 3 | 4 | 5;

export interface RatingSummary {
  average: number | null;
  count: number;
  distribution: Record<StarRating, number>;
}

export interface ReviewPage {
  summary: RatingSummary;
  items: Review[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NewReview {
  authorName: string;
  rating: number;
  comment: string;
  /** Honeypot: real users leave it empty. */
  website?: string;
}

export interface CatalogStatus {
  lastImportAt: string | null;
  listedProducts: number;
}
