import { ImportAbortedError } from './import-errors';
import { DEFAULT_MAX_CHANGE_RATIO, DEFAULT_MIN_RATIO, planImport } from './import-planner';
import type { ExistingProductState, NormalizedRow } from './import.types';

function row(sku: string, hash = `h-${sku}`): NormalizedRow {
  return {
    line: 1,
    hash,
    product: {
      sku,
      name: sku,
      chemicalName: 'X',
      function: 'Y',
      applicationArea: 'Z',
      region: 'Global',
      certifications: [],
      status: 'ACTIVE',
      launchYear: null,
      description: 'D',
    },
  };
}

function existing(sku: string, listed = true, contentHash = `h-${sku}`): ExistingProductState {
  return { sku, listed, contentHash };
}

// The mass-change guard is tested separately, so the other tests allow any amount of change.
const options = { force: false, minRatio: DEFAULT_MIN_RATIO, maxChangeRatio: 1, untouchedSkus: new Set<string>() };

describe('planImport', () => {
  it('creates everything on an empty catalogue', () => {
    const plan = planImport([row('P-1'), row('P-2')], [], options);
    expect(plan.creates.map((r) => r.product.sku)).toEqual(['P-1', 'P-2']);
    expect(plan).toMatchObject({ updates: [], relists: [], delists: [], unchanged: 0 });
  });

  it('classifies unchanged, updated, relisted and delisted products', () => {
    const plan = planImport(
      [row('P-1'), row('P-2', 'changed'), row('P-3'), row('P-5')],
      [existing('P-1'), existing('P-2'), existing('P-3', false), existing('P-4')],
      options,
    );

    expect(plan.unchanged).toBe(1);
    expect(plan.updates.map((r) => r.product.sku)).toEqual(['P-2']);
    expect(plan.relists.map((r) => r.product.sku)).toEqual(['P-3']);
    expect(plan.creates.map((r) => r.product.sku)).toEqual(['P-5']);
    expect(plan.delists).toEqual(['P-4']);
  });

  it('does not delist products that are already delisted', () => {
    const plan = planImport([row('P-1')], [existing('P-1'), existing('P-9', false)], options);
    expect(plan.delists).toEqual([]);
  });

  it('aborts when the export has no valid rows', () => {
    expect(() => planImport([], [existing('P-1')], options)).toThrow(ImportAbortedError);
  });

  it('aborts when the export is suspiciously small compared to the listed catalogue', () => {
    const current = Array.from({ length: 10 }, (_, i) => existing(`P-${i}`));
    expect(() => planImport([row('P-0'), row('P-1'), row('P-2'), row('P-3')], current, options)).toThrow(/--force/);
  });

  it('allows a small export when forced', () => {
    const current = Array.from({ length: 10 }, (_, i) => existing(`P-${i}`));
    const plan = planImport([row('P-0')], current, { ...options, force: true });
    expect(plan.delists).toHaveLength(9);
  });

  it('leaves untouched SKUs alone: no delist, and their valid row is ignored', () => {
    const plan = planImport(
      [row('P-1'), row('P-2', 'changed'), row('P-4')],
      [existing('P-1'), existing('P-2'), existing('P-3'), existing('P-4')],
      { ...options, untouchedSkus: new Set(['P-2', 'P-3']) },
    );

    expect(plan.delists).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.unchanged).toBe(2);
  });

  it('does not create a new SKU that is untouched', () => {
    const plan = planImport([row('P-1'), row('P-9')], [existing('P-1')], {
      ...options,
      untouchedSkus: new Set(['P-9']),
    });
    expect(plan.creates).toEqual([]);
  });

  it('delists nothing when skipDelists is set, but still creates and updates', () => {
    const plan = planImport([row('P-1', 'changed'), row('P-5')], [existing('P-1'), existing('P-4')], {
      ...options,
      skipDelists: true,
    });

    expect(plan.delists).toEqual([]);
    expect(plan.updates.map((r) => r.product.sku)).toEqual(['P-1']);
    expect(plan.creates.map((r) => r.product.sku)).toEqual(['P-5']);
  });

  it('formats the guard percentage as a whole number', () => {
    const current = Array.from({ length: 10 }, (_, i) => existing(`P-${i}`));
    expect(() => planImport([row('P-0')], current, { ...options, minRatio: 0.7 })).toThrow('(below 70%)');
  });

  it('counts only listed products for the size guard and reports the numbers', () => {
    const current = [
      ...Array.from({ length: 4 }, (_, i) => existing(`L-${i}`)),
      ...Array.from({ length: 6 }, (_, i) => existing(`D-${i}`, false)),
    ];
    const rows = [row('L-0'), row('L-1'), row('L-2')];
    expect(() => planImport(rows, current, options)).not.toThrow();

    const tenListed = Array.from({ length: 10 }, (_, i) => existing(`P-${i}`));
    expect(() => planImport([row('P-0'), row('P-1')], tenListed, options)).toThrow(
      'The export has 2 valid rows but 10 products are listed (below 50%); rerun with --force if this is intended',
    );
  });

  it('aborts on an empty export even when nothing is listed', () => {
    expect(() => planImport([], [], options)).toThrow(
      'The export contains no valid rows; refusing to delist the whole catalogue',
    );
  });

  it('returns delisted SKUs in sorted order', () => {
    const current = [existing('P-3'), existing('P-1'), existing('P-2')];
    const plan = planImport([row('P-9')], current, { ...options, force: true });
    expect(plan.delists).toEqual(['P-1', 'P-2', 'P-3']);
  });

  describe('mass-change guard', () => {
    const guard = { ...options, maxChangeRatio: DEFAULT_MAX_CHANGE_RATIO };
    const listed = Array.from({ length: 10 }, (_, i) => existing(`P-${i}`));
    const unchangedRows = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, i) => row(`P-${from + i}`));

    it('allows changes up to exactly 30 percent', () => {
      const rows = [row('P-0', 'x'), row('P-1', 'x'), row('P-2', 'x'), ...unchangedRows(3, 10)];
      expect(planImport(rows, listed, guard).updates).toHaveLength(3);
    });

    it('aborts above 30 percent and names the counts and --force', () => {
      const rows = [row('P-0', 'x'), row('P-1', 'x'), row('P-2', 'x'), ...unchangedRows(3, 9)];
      expect(() => planImport(rows, listed, guard)).toThrow(
        'The export would change or delist 4 of 10 listed products (above 30%); rerun with --force if this is intended',
      );
    });

    it('allows the same change when forced', () => {
      const rows = [row('P-0', 'x'), row('P-1', 'x'), row('P-2', 'x'), ...unchangedRows(3, 9)];
      expect(planImport(rows, listed, { ...guard, force: true }).delists).toEqual(['P-9']);
    });

    it('allows creating rows in an empty catalogue', () => {
      const rows = Array.from({ length: 5 }, (_, i) => row(`N-${i}`));
      expect(planImport(rows, [], guard).creates).toHaveLength(5);
    });
  });
});
