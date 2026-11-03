import type { ProductView } from '../../catalog';
import { toProductDocument, toSearchItem } from './product-document';

const product: ProductView = {
  sku: 'P-10119',
  name: null,
  displayName: 'P-10119',
  chemicalName: 'Squalane',
  function: 'Emollient',
  applicationArea: 'Personal Care',
  region: 'Global',
  certifications: ['Halal'],
  status: 'ACTIVE',
  launchYear: null,
  description: 'Emollient based on Squalane.',
  listed: true,
  updatedAt: new Date('2026-01-01'),
};

describe('toProductDocument', () => {
  it('omits null sort fields so Meilisearch sorts them last', () => {
    const document = toProductDocument(product, undefined);

    expect(document).not.toHaveProperty('launchYear');
    expect(document).not.toHaveProperty('ratingAverage');
    expect(document).toMatchObject({ sku: 'P-10119', displayName: 'P-10119', reviewCount: 0 });
  });

  it('includes rating and launch year when present', () => {
    const document = toProductDocument({ ...product, launchYear: 2017 }, { average: 4.3, count: 3 });

    expect(document).toMatchObject({ launchYear: 2017, ratingAverage: 4.3, reviewCount: 3 });
  });
});

describe('toSearchItem', () => {
  it('maps missing optional fields back to null', () => {
    expect(toSearchItem(toProductDocument(product, undefined))).toEqual({
      sku: 'P-10119',
      displayName: 'P-10119',
      chemicalName: 'Squalane',
      function: 'Emollient',
      applicationArea: 'Personal Care',
      region: 'Global',
      certifications: ['Halal'],
      status: 'ACTIVE',
      launchYear: null,
      ratingAverage: null,
      reviewCount: 0,
    });
  });
});
