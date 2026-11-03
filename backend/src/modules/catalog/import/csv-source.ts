import { parse } from 'csv-parse/sync';
import { errorMessage } from '../../../shared/util/error-message';
import { ImportAbortedError } from './import-errors';
import type { ImportIssue, SourceRow } from './import.types';

export const REQUIRED_HEADERS = [
  'sku',
  'name',
  'chemical_name',
  'function',
  'application_area',
  'region',
  'certifications',
  'status',
  'launch_year',
  'description',
] as const;

interface ParsedRecord {
  record: string[];
  info: { lines: number };
}

export function readCsvRows(content: string): { rows: SourceRow[]; issues: ImportIssue[] } {
  let records: ParsedRecord[];
  try {
    records = parse(content, {
      bom: true,
      skip_empty_lines: true,
      skip_records_with_empty_values: true,
      relax_column_count: true,
      relax_quotes: true,
      info: true,
    }) as unknown as ParsedRecord[];
  } catch (error) {
    throw new ImportAbortedError(`Cannot parse CSV: ${errorMessage(error)}`);
  }

  if (records.length === 0) {
    throw new ImportAbortedError('The file is empty');
  }

  const headers = records[0].record.map((header) => header.trim().toLowerCase());
  const duplicates = [...new Set(headers.filter((header, index) => headers.indexOf(header) !== index))];
  if (duplicates.length > 0) {
    throw new ImportAbortedError(`Duplicate columns: ${duplicates.join(', ')}`);
  }
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new ImportAbortedError(`Missing required columns: ${missing.join(', ')}`);
  }

  const skuIndex = headers.indexOf('sku');
  const rows: SourceRow[] = [];
  const issues: ImportIssue[] = [];

  for (const { record, info } of records.slice(1)) {
    if (record.length !== headers.length) {
      issues.push({
        line: info.lines,
        sku: record[skuIndex]?.trim() || null,
        field: null,
        severity: 'error',
        message: `Expected ${headers.length} columns, got ${record.length}`,
      });
      continue;
    }
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = record[index];
    });
    rows.push({ line: info.lines, values });
  }

  return { rows, issues };
}
