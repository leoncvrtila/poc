import type { ProductDetail } from '../../core/api/api.models';
import { statusBanner } from './status-banner';

const product: ProductDetail = {
  sku: 'P-1',
  name: 'Alpha',
  displayName: 'Alpha',
  chemicalName: 'Glycerin',
  function: 'Emollient',
  applicationArea: 'Personal Care',
  region: 'EMEA',
  certifications: [],
  status: 'ACTIVE',
  launchYear: 2020,
  description: 'Nice',
  listed: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('statusBanner', () => {
  it('shows nothing for an active, listed product', () => {
    expect(statusBanner(product)).toBeNull();
  });

  it('warns about phase-out', () => {
    expect(statusBanner({ ...product, status: 'PHASE_OUT' })).toMatchObject({ severity: 'warn', summary: 'Phasing out' });
  });

  it('flags discontinued products', () => {
    expect(statusBanner({ ...product, status: 'DISCONTINUED' })).toMatchObject({ severity: 'error', summary: 'No longer sold' });
  });

  it('gives delisting priority over status', () => {
    expect(statusBanner({ ...product, status: 'PHASE_OUT', listed: false })).toMatchObject({
      severity: 'error',
      summary: 'No longer in the catalogue',
    });
  });
});

describe('statusBanner details', () => {
  it('explains each state', () => {
    expect(statusBanner({ ...product, listed: false })?.detail).toBe(
      'This product is not part of our current range. Existing reviews are kept for reference.',
    );
    expect(statusBanner({ ...product, status: 'DISCONTINUED' })?.detail).toBe(
      'This product has been discontinued. Please contact your sales representative for alternatives.',
    );
    expect(statusBanner({ ...product, status: 'PHASE_OUT' })?.detail).toBe(
      'This product is being phased out and availability may be limited.',
    );
  });
});
