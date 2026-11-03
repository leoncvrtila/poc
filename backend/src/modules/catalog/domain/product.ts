export const PRODUCT_STATUSES = ['ACTIVE', 'PHASE_OUT', 'DISCONTINUED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Public read model of a product, shared with other modules through the catalog facade. */
export interface ProductView {
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
  updatedAt: Date;
}
