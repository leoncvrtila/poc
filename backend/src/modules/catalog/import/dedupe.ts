import type { ImportIssue, NormalizedRow } from './import.types';

/** The export is ordered oldest-to-newest, so the last row for a SKU wins. */
export function dedupeBySku(rows: NormalizedRow[]): { rows: NormalizedRow[]; issues: ImportIssue[] } {
  const bySku = new Map<string, NormalizedRow>();
  const issues: ImportIssue[] = [];

  for (const row of rows) {
    const previous = bySku.get(row.product.sku);
    if (previous) {
      issues.push({
        line: row.line,
        sku: row.product.sku,
        field: 'sku',
        severity: 'warning',
        message:
          previous.hash === row.hash
            ? `Duplicate of line ${previous.line} (identical, ignored)`
            : `Duplicate of line ${previous.line}; this later row wins`,
      });
      bySku.delete(row.product.sku);
    }
    bySku.set(row.product.sku, row);
  }

  return { rows: [...bySku.values()], issues };
}
