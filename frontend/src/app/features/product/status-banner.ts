import type { ProductDetail } from '../../core/api/api.models';

export interface StatusBanner {
  severity: 'warn' | 'error';
  summary: string;
  detail: string;
}

/** Makes sure nobody mistakes an outdated product for something we still sell. */
export function statusBanner(product: ProductDetail): StatusBanner | null {
  if (!product.listed) {
    return {
      severity: 'error',
      summary: 'No longer in the catalogue',
      detail: 'This product is not part of our current range. Existing reviews are kept for reference.',
    };
  }
  if (product.status === 'DISCONTINUED') {
    return {
      severity: 'error',
      summary: 'No longer sold',
      detail: 'This product has been discontinued. Please contact your sales representative for alternatives.',
    };
  }
  if (product.status === 'PHASE_OUT') {
    return {
      severity: 'warn',
      summary: 'Phasing out',
      detail: 'This product is being phased out and availability may be limited.',
    };
  }
  return null;
}
