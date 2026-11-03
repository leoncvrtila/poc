import { createHash } from 'node:crypto';
import type { NormalizedProduct } from './import.types';

/** Fingerprint of everything the PIM controls. Used to skip unchanged rows on nightly imports. */
export function contentHash(product: NormalizedProduct): string {
  const canonical = [
    product.sku,
    product.name,
    product.chemicalName,
    product.function,
    product.applicationArea,
    product.region,
    product.certifications,
    product.status,
    product.launchYear,
    product.description,
  ];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
