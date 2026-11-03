import type { ProductDetail } from '../../core/api/api.models';
import { STATUS_LABEL, STATUS_SEVERITY } from '../../shared/product-status';

export type CompareRowKey =
  | 'function'
  | 'applicationArea'
  | 'region'
  | 'chemicalName'
  | 'launchYear'
  | 'certifications'
  | 'description';

export interface CompareRow {
  key: CompareRowKey;
  label: string;
  /** One value per column; null where the product could not be loaded. */
  values: (string | null)[];
  /** At least two products loaded, and all of them have this value. */
  same: boolean;
}

export interface AvailabilityTag {
  label: string;
  severity: 'success' | 'warn' | 'danger';
}

const ROWS: { key: CompareRowKey; label: string; value: (product: ProductDetail) => string }[] = [
  { key: 'function', label: 'Function', value: (product) => product.function },
  { key: 'applicationArea', label: 'Application area', value: (product) => product.applicationArea },
  { key: 'region', label: 'Region', value: (product) => product.region },
  { key: 'chemicalName', label: 'Chemistry', value: (product) => product.chemicalName },
  { key: 'launchYear', label: 'Launched', value: (product) => String(product.launchYear ?? 'Not specified') },
  // The API sends them sorted today; sorting keeps `same` independent of that. The page shows the union matrix, so this value only decides `same`.
  {
    key: 'certifications',
    label: 'Certifications',
    value: (product) => [...product.certifications].sort().join(', '),
  },
  { key: 'description', label: 'Description', value: (product) => product.description },
];

/** One row per attribute, one value per column. */
export function compareRows(products: readonly (ProductDetail | null)[]): CompareRow[] {
  return ROWS.map(({ key, label, value }) => {
    const values = products.map((product) => (product ? value(product) : null));
    const loaded = values.filter((entry) => entry !== null);
    return { key, label, values, same: loaded.length > 1 && loaded.every((entry) => entry === loaded[0]) };
  });
}

/** Every certification any compared product holds, so each column lists the same names in the same order. */
export function certificationUnion(products: readonly (ProductDetail | null)[]): string[] {
  return [...new Set(products.flatMap((product) => product?.certifications ?? []))].sort();
}

/** A delisted product keeps its last PIM status, so that status alone would look like something we still sell. */
export function availabilityTag(product: ProductDetail): AvailabilityTag {
  return product.listed
    ? { label: STATUS_LABEL[product.status], severity: STATUS_SEVERITY[product.status] }
    : { label: 'No longer in the catalogue', severity: 'danger' };
}
