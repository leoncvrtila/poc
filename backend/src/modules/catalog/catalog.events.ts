export const CATALOG_PRODUCTS_CHANGED = 'catalog.products-changed';

/** Carries only SKUs: consumers always read the current state from the catalog facade. */
export interface ProductsChangedPayload {
  skus: string[];
}
