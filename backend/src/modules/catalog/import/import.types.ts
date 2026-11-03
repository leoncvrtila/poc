import type { ProductStatus } from '../domain/product';

export interface NormalizedProduct {
  sku: string;
  name: string | null;
  chemicalName: string;
  function: string;
  applicationArea: string;
  region: string;
  certifications: string[];
  status: ProductStatus;
  launchYear: number | null;
  description: string;
}

export type IssueSeverity = 'warning' | 'error';

export interface ImportIssue {
  line: number | null;
  sku: string | null;
  field: string | null;
  severity: IssueSeverity;
  message: string;
}

export interface SourceRow {
  line: number;
  values: Record<string, string>;
}

export interface NormalizedRow {
  line: number;
  product: NormalizedProduct;
  hash: string;
}

export interface ExistingProductState {
  sku: string;
  contentHash: string;
  listed: boolean;
}
