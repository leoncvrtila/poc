import { normalizeCertifications, normalizeLaunchYear, normalizeRow, normalizeStatus } from './normalize-row';
import type { SourceRow } from './import.types';

const CURRENT_YEAR = 2026;

function source(overrides: Record<string, string> = {}, line = 2): SourceRow {
  return {
    line,
    values: {
      sku: 'P-10001',
      name: 'Quorin SF 470',
      chemical_name: 'Sodium Laureth Sulfate',
      function: 'Surfactant',
      application_area: 'Home Care',
      region: 'EMEA',
      certifications: 'Kosher|RSPO Mass Balance',
      status: 'Active',
      launch_year: '2012',
      description: 'Surfactant for home care.',
      ...overrides,
    },
  };
}

describe('normalizeStatus', () => {
  it.each([
    ['Active', 'ACTIVE'],
    ['active', 'ACTIVE'],
    ['ACTIVE', 'ACTIVE'],
    ['Phase-out', 'PHASE_OUT'],
    ['Phase out', 'PHASE_OUT'],
    ['phase_out', 'PHASE_OUT'],
    ['Discontinued', 'DISCONTINUED'],
    ['  discontinued ', 'DISCONTINUED'],
  ])('maps %p to %p', (raw, expected) => {
    expect(normalizeStatus(raw)).toBe(expected);
  });

  it('returns null for unknown values', () => {
    expect(normalizeStatus('Retired')).toBeNull();
    expect(normalizeStatus('')).toBeNull();
  });
});

describe('normalizeCertifications', () => {
  it('splits, trims, drops empty tokens, dedupes and sorts', () => {
    expect(normalizeCertifications('Halal|Vegan|')).toEqual(['Halal', 'Vegan']);
    expect(normalizeCertifications(' Vegan | Halal|Vegan')).toEqual(['Halal', 'Vegan']);
    expect(normalizeCertifications('')).toEqual([]);
    expect(normalizeCertifications('vegan|Zeta|Alpha')).toEqual(['Alpha', 'Zeta', 'vegan']);
  });
});

describe('normalizeLaunchYear', () => {
  it('accepts four-digit years up to next year', () => {
    expect(normalizeLaunchYear('2012', CURRENT_YEAR)).toBe(2012);
    expect(normalizeLaunchYear('2027', CURRENT_YEAR)).toBe(2027);
  });

  it.each(['', 'n/a', '1850', '2028', '12', '20x2'])('rejects %p', (raw) => {
    expect(normalizeLaunchYear(raw, CURRENT_YEAR)).toBeNull();
  });
});

describe('normalizeRow', () => {
  it('produces a clean product without issues for a valid row', () => {
    const result = normalizeRow(source(), CURRENT_YEAR);

    expect(result.issues).toEqual([]);
    expect(result.product).toEqual({
      sku: 'P-10001',
      name: 'Quorin SF 470',
      chemicalName: 'Sodium Laureth Sulfate',
      function: 'Surfactant',
      applicationArea: 'Home Care',
      region: 'EMEA',
      certifications: ['Kosher', 'RSPO Mass Balance'],
      status: 'ACTIVE',
      launchYear: 2012,
      description: 'Surfactant for home care.',
    });
  });

  it('trims surrounding whitespace (e.g. " EMEA " and "  Puraxin SF 120 ")', () => {
    const result = normalizeRow(source({ region: ' EMEA ', name: '  Puraxin SF 120 ' }), CURRENT_YEAR);

    expect(result.product?.region).toBe('EMEA');
    expect(result.product?.name).toBe('Puraxin SF 120');
  });

  it('keeps a product without a name and warns', () => {
    const result = normalizeRow(source({ sku: 'P-10119', name: '' }, 121), CURRENT_YEAR);

    expect(result.product?.name).toBeNull();
    expect(result.issues).toEqual([
      {
        line: 121,
        sku: 'P-10119',
        field: 'name',
        severity: 'warning',
        message: 'Missing product name; the SKU is shown instead',
      },
    ]);
  });

  it('stores an unusable launch year as null and warns', () => {
    expect(normalizeRow(source({ launch_year: 'n/a' }), CURRENT_YEAR).issues[0]).toMatchObject({
      field: 'launch_year',
      severity: 'warning',
      message: 'Invalid launch year "n/a"',
    });
    expect(normalizeRow(source({ launch_year: '' }), CURRENT_YEAR).issues[0]).toMatchObject({
      field: 'launch_year',
      message: 'Missing launch year',
    });
  });

  it('rejects a row with an unknown status', () => {
    const result = normalizeRow(source({ status: 'Retired' }), CURRENT_YEAR);

    expect(result.product).toBeNull();
    expect(result.issues).toEqual([
      { line: 2, sku: 'P-10001', field: 'status', severity: 'error', message: 'Unknown status "Retired"' },
    ]);
  });

  it('rejects a row without a SKU', () => {
    const result = normalizeRow(source({ sku: '  ' }), CURRENT_YEAR);

    expect(result.product).toBeNull();
    expect(result.issues[0]).toMatchObject({ field: 'sku', severity: 'error', message: 'Missing SKU' });
  });

  it('rejects a row with a missing required attribute', () => {
    const result = normalizeRow(source({ function: '' }), CURRENT_YEAR);

    expect(result.product).toBeNull();
    expect(result.issues[0]).toMatchObject({ field: 'function', severity: 'error', message: 'Missing function' });
  });
});

describe('normalization edge cases', () => {
  it.each(['phase - out', 'PHASE__OUT', ' phase_ -out '])('maps %p to PHASE_OUT', (raw) => {
    expect(normalizeStatus(raw)).toBe('PHASE_OUT');
  });

  it('trims and bounds launch years strictly', () => {
    expect(normalizeLaunchYear(' 2012 ', CURRENT_YEAR)).toBe(2012);
    expect(normalizeLaunchYear('1900', CURRENT_YEAR)).toBe(1900);
    expect(normalizeLaunchYear('1899', CURRENT_YEAR)).toBeNull();
    expect(normalizeLaunchYear('x2012', CURRENT_YEAR)).toBeNull();
    expect(normalizeLaunchYear('2012x', CURRENT_YEAR)).toBeNull();
    for (const raw of ['2e3', '0x7D', '+2012', '2012.0', '-2012', '']) {
      expect(normalizeLaunchYear(raw, CURRENT_YEAR)).toBeNull();
    }
  });

  it('still produces a product when only warnings are reported', () => {
    const result = normalizeRow(source({ name: '', launch_year: 'soon' }), CURRENT_YEAR);
    expect(result.issues.map((issue) => issue.severity)).toEqual(['warning', 'warning']);
    expect(result.product).not.toBeNull();
  });

  it('treats a column absent from the row as empty', () => {
    const row = source();
    delete row.values.name;
    const result = normalizeRow(row, CURRENT_YEAR);
    expect(result.issues).toEqual([expect.objectContaining({ field: 'name', severity: 'warning' })]);
  });
});
