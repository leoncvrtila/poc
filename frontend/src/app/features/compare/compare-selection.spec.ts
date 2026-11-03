import { convertToParamMap } from '@angular/router';
import {
  type CompareItem,
  MAX_COMPARE,
  parseCompareSkus,
  parseStoredItems,
  toggleItem,
} from './compare-selection';

const item = (sku: string): CompareItem => ({ sku, displayName: `Product ${sku}` });

describe('toggleItem', () => {
  it('adds a product at the end and keeps only what the selection needs', () => {
    const summary = { ...item('P-2'), chemicalName: 'Polysorbate 80', reviewCount: 3 };
    expect(toggleItem([item('P-1')], summary)).toEqual([item('P-1'), item('P-2')]);
  });

  it('removes a product that is already selected', () => {
    expect(toggleItem([item('P-1'), item('P-2')], item('P-1'))).toEqual([item('P-2')]);
  });

  it('does not add more than three products', () => {
    const full = [item('P-1'), item('P-2'), item('P-3')];
    expect(MAX_COMPARE).toBe(3);
    expect(toggleItem(full, item('P-4'))).toBe(full);
    expect(toggleItem(full, item('P-2'))).toEqual([item('P-1'), item('P-3')]);
  });
});

describe('parseStoredItems', () => {
  it('reads a stored selection', () => {
    expect(parseStoredItems(JSON.stringify([item('P-1'), item('P-2')]))).toEqual([item('P-1'), item('P-2')]);
  });

  it.each(['', '{oops', 'null', '{"sku":"P-1"}', '"P-1"'])('treats %p as no selection', (raw) => {
    expect(parseStoredItems(raw)).toEqual([]);
  });

  it('drops malformed entries and extra fields', () => {
    const raw = JSON.stringify([
      null,
      { sku: 'P-1' },
      { displayName: 'No SKU' },
      { sku: 2, displayName: 'Numeric SKU' },
      { ...item('P-2'), stale: true },
    ]);
    expect(parseStoredItems(raw)).toEqual([item('P-2')]);
  });

  it('keeps at most three products', () => {
    const raw = JSON.stringify(['P-1', 'P-2', 'P-3', 'P-4'].map((sku) => item(sku)));
    expect(parseStoredItems(raw)).toEqual(['P-1', 'P-2', 'P-3'].map((sku) => item(sku)));
  });
});

describe('parseCompareSkus', () => {
  it('reads repeated sku params, trimmed, without blanks or duplicates', () => {
    expect(parseCompareSkus(convertToParamMap({ sku: [' P-1 ', ' ', 'P-2', 'P-1'] }))).toEqual(['P-1', 'P-2']);
  });

  it('drops blanks and duplicates before keeping the first three', () => {
    expect(parseCompareSkus(convertToParamMap({ sku: ['P-1', ' ', 'P-1', 'P-2', 'P-3', 'P-4'] }))).toEqual([
      'P-1',
      'P-2',
      'P-3',
    ]);
  });

  it('accepts a single sku and no sku', () => {
    expect(parseCompareSkus(convertToParamMap({ sku: 'P-1' }))).toEqual(['P-1']);
    expect(parseCompareSkus(convertToParamMap({}))).toEqual([]);
  });
});
