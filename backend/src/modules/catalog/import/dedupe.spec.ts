import { dedupeBySku } from './dedupe';
import type { NormalizedRow } from './import.types';

function row(sku: string, line: number, hash: string): NormalizedRow {
  return {
    line,
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

describe('dedupeBySku', () => {
  it('keeps unique rows untouched', () => {
    const rows = [row('P-1', 2, 'a'), row('P-2', 3, 'b')];
    expect(dedupeBySku(rows)).toEqual({ rows, issues: [] });
  });

  it('keeps the last occurrence and reports a conflicting duplicate', () => {
    const result = dedupeBySku([
      row('P-10151', 153, 'active'),
      row('P-2', 154, 'b'),
      row('P-10151', 203, 'discontinued'),
    ]);

    expect(result.rows.map((r) => [r.product.sku, r.line])).toEqual([
      ['P-2', 154],
      ['P-10151', 203],
    ]);
    expect(result.issues).toEqual([
      {
        line: 203,
        sku: 'P-10151',
        field: 'sku',
        severity: 'warning',
        message: 'Duplicate of line 153; this later row wins',
      },
    ]);
  });

  it('reports identical duplicates as ignored', () => {
    const result = dedupeBySku([row('P-10013', 14, 'same'), row('P-10013', 99, 'same')]);

    expect(result.rows).toHaveLength(1);
    expect(result.issues[0].message).toBe('Duplicate of line 14 (identical, ignored)');
  });
});
