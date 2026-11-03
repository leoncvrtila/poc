import type { ProductDetail } from '../../core/api/api.models';
import {
  availabilityTag,
  certificationUnion,
  type CompareRow,
  type CompareRowKey,
  compareRows,
} from './compare-table';

function product(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    sku: 'P-1',
    name: 'Gel One',
    displayName: 'Gel One',
    chemicalName: 'Polysorbate 80',
    function: 'Emulsifier',
    applicationArea: 'Personal Care',
    region: 'EMEA',
    certifications: ['Kosher', 'Vegan'],
    status: 'ACTIVE',
    launchYear: 2017,
    description: 'Enables cold-process formulation.',
    listed: true,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const row = (rows: CompareRow[], key: CompareRowKey): CompareRow => rows.find((r) => r.key === key)!;

describe('compareRows', () => {
  it('lists the attributes in a fixed order with one value per product', () => {
    const rows = compareRows([product(), product({ sku: 'P-2', launchYear: null, certifications: [] })]);

    expect(rows.map((r) => [r.key, r.label, r.values])).toEqual([
      ['function', 'Function', ['Emulsifier', 'Emulsifier']],
      ['applicationArea', 'Application area', ['Personal Care', 'Personal Care']],
      ['region', 'Region', ['EMEA', 'EMEA']],
      ['chemicalName', 'Chemistry', ['Polysorbate 80', 'Polysorbate 80']],
      ['launchYear', 'Launched', ['2017', 'Not specified']],
      ['certifications', 'Certifications', ['Kosher, Vegan', '']],
      ['description', 'Description', ['Enables cold-process formulation.', 'Enables cold-process formulation.']],
    ]);
  });

  it('marks the attributes all products share', () => {
    const rows = compareRows([
      product(),
      product({ sku: 'P-2', region: 'Global', certifications: ['Vegan', 'Kosher'] }),
    ]);

    expect(row(rows, 'function').same).toBe(true);
    expect(row(rows, 'region').same).toBe(false);
    expect(row(rows, 'certifications').same).toBe(true);
  });

  it('leaves products that could not be loaded out of the comparison', () => {
    const rows = compareRows([product(), null, product({ sku: 'P-3' })]);

    expect(row(rows, 'function').values).toEqual(['Emulsifier', null, 'Emulsifier']);
    expect(row(rows, 'function').same).toBe(true);
  });

  it('needs two loaded products before anything counts as the same', () => {
    expect(row(compareRows([product(), null]), 'function').same).toBe(false);
  });
});

describe('certificationUnion', () => {
  it('collects every certification once, sorted, skipping products that did not load', () => {
    const union = certificationUnion([
      product({ certifications: ['Vegan', 'Kosher'] }),
      null,
      product({ certifications: ['Halal', 'Kosher'] }),
    ]);

    expect(union).toEqual(['Halal', 'Kosher', 'Vegan']);
  });

  it('is empty when no product is certified', () => {
    expect(certificationUnion([product({ certifications: [] })])).toEqual([]);
  });
});

describe('availabilityTag', () => {
  it('shows the PIM status of a listed product', () => {
    expect(availabilityTag(product())).toEqual({ label: 'Active', severity: 'success' });
    expect(availabilityTag(product({ status: 'PHASE_OUT' }))).toEqual({ label: 'Phasing out', severity: 'warn' });
  });

  it('flags a delisted product whatever its last status was', () => {
    expect(availabilityTag(product({ listed: false }))).toEqual({ label: 'No longer in the catalogue', severity: 'danger' });
  });
});
