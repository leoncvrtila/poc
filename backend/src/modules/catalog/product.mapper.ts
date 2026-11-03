import type { Product } from '../../generated/prisma/client';
import type { ProductView } from './domain/product';

export function toProductView(product: Product): ProductView {
  return {
    sku: product.sku,
    name: product.name,
    displayName: product.name ?? product.sku,
    chemicalName: product.chemicalName,
    function: product.function,
    applicationArea: product.applicationArea,
    region: product.region,
    certifications: product.certifications,
    status: product.status,
    launchYear: product.launchYear,
    description: product.description,
    listed: product.listed,
    updatedAt: product.updatedAt,
  };
}
