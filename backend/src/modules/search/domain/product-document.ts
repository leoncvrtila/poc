import type { ProductStatus, ProductView } from '../../catalog';
import type { RatingSummary } from '../../reviews';
import type { ProductSearchItem } from './search-result';

/** Shape stored in the search index: catalogue data denormalised with review aggregates. */
export interface ProductDocument {
  sku: string;
  displayName: string;
  name: string | null;
  chemicalName: string;
  function: string;
  applicationArea: string;
  region: string;
  certifications: string[];
  status: ProductStatus;
  description: string;
  launchYear?: number;
  ratingAverage?: number;
  reviewCount: number;
}

export function toProductDocument(product: ProductView, rating: RatingSummary | undefined): ProductDocument {
  const document: ProductDocument = {
    sku: product.sku,
    displayName: product.displayName,
    name: product.name,
    chemicalName: product.chemicalName,
    function: product.function,
    applicationArea: product.applicationArea,
    region: product.region,
    certifications: product.certifications,
    status: product.status,
    description: product.description,
    reviewCount: rating?.count ?? 0,
  };
  if (product.launchYear !== null) {
    document.launchYear = product.launchYear;
  }
  if (rating && rating.average !== null) {
    document.ratingAverage = rating.average;
  }
  return document;
}

export function toSearchItem(document: ProductDocument): ProductSearchItem {
  return {
    sku: document.sku,
    displayName: document.displayName,
    chemicalName: document.chemicalName,
    function: document.function,
    applicationArea: document.applicationArea,
    region: document.region,
    certifications: document.certifications,
    status: document.status,
    launchYear: document.launchYear ?? null,
    ratingAverage: document.ratingAverage ?? null,
    reviewCount: document.reviewCount ?? 0,
  };
}
