import type { ProductStatus } from '../core/api/api.models';

export const STATUS_LABEL: Record<ProductStatus, string> = {
  ACTIVE: 'Active',
  PHASE_OUT: 'Phasing out',
  DISCONTINUED: 'Discontinued',
};

export const STATUS_SEVERITY: Record<ProductStatus, 'success' | 'warn' | 'danger'> = {
  ACTIVE: 'success',
  PHASE_OUT: 'warn',
  DISCONTINUED: 'danger',
};
