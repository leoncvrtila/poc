import type { ProductStatus } from '../domain/product';
import type { ImportIssue, IssueSeverity, NormalizedProduct, SourceRow } from './import.types';

const STATUS_BY_KEY: Record<string, ProductStatus> = {
  active: 'ACTIVE',
  phaseout: 'PHASE_OUT',
  discontinued: 'DISCONTINUED',
};

const REQUIRED_TEXT_COLUMNS = ['chemical_name', 'function', 'application_area', 'region', 'description'] as const;

export interface NormalizeResult {
  product: NormalizedProduct | null;
  issues: ImportIssue[];
}

export function normalizeStatus(raw: string): ProductStatus | null {
  const key = raw.toLowerCase().replace(/[\s_-]/g, '');
  return STATUS_BY_KEY[key] ?? null;
}

export function normalizeCertifications(raw: string): string[] {
  const tokens = raw
    .split('|')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return [...new Set(tokens)].sort();
}

export function normalizeLaunchYear(raw: string, currentYear: number): number | null {
  const value = raw.trim();
  if (!/^\d{4}$/.test(value)) {
    return null;
  }
  const year = Number(value);
  return year >= 1900 && year <= currentYear + 1 ? year : null;
}

export function normalizeRow(row: SourceRow, currentYear: number): NormalizeResult {
  const value = (column: string): string => (row.values[column] ?? '').trim();
  const sku = value('sku');
  const issues: ImportIssue[] = [];
  const report = (field: string, severity: IssueSeverity, message: string): void => {
    issues.push({ line: row.line, sku: sku || null, field, severity, message });
  };

  if (!sku) {
    report('sku', 'error', 'Missing SKU');
    return { product: null, issues };
  }

  const status = normalizeStatus(value('status'));
  if (!status) {
    report('status', 'error', `Unknown status "${value('status')}"`);
  }
  const missingColumns = REQUIRED_TEXT_COLUMNS.filter((column) => !value(column));
  for (const column of missingColumns) {
    report(column, 'error', `Missing ${column}`);
  }
  if (!status || missingColumns.length > 0) {
    return { product: null, issues };
  }

  const name = value('name') || null;
  if (!name) {
    report('name', 'warning', 'Missing product name; the SKU is shown instead');
  }

  const rawYear = value('launch_year');
  const launchYear = normalizeLaunchYear(rawYear, currentYear);
  if (launchYear === null) {
    report('launch_year', 'warning', rawYear ? `Invalid launch year "${rawYear}"` : 'Missing launch year');
  }

  return {
    product: {
      sku,
      name,
      chemicalName: value('chemical_name'),
      function: value('function'),
      applicationArea: value('application_area'),
      region: value('region'),
      certifications: normalizeCertifications(value('certifications')),
      status,
      launchYear,
      description: value('description'),
    },
    issues,
  };
}
