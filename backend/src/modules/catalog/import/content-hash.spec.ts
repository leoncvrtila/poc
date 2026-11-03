import { contentHash } from './content-hash';
import type { NormalizedProduct } from './import.types';

const product: NormalizedProduct = {
  sku: 'P-1',
  name: 'Alpha',
  chemicalName: 'Glycerin',
  function: 'Emollient',
  applicationArea: 'Personal Care',
  region: 'EMEA',
  certifications: ['Halal', 'Vegan'],
  status: 'ACTIVE',
  launchYear: 2020,
  description: 'Nice',
};

describe('contentHash', () => {
  it('is stable for equal content', () => {
    expect(contentHash(product)).toBe(contentHash({ ...product, certifications: ['Halal', 'Vegan'] }));
  });

  it('changes when any attribute changes', () => {
    expect(contentHash(product)).not.toBe(contentHash({ ...product, status: 'DISCONTINUED' }));
    expect(contentHash(product)).not.toBe(contentHash({ ...product, launchYear: null }));
    expect(contentHash(product)).not.toBe(contentHash({ ...product, certifications: ['Halal'] }));
  });
});
