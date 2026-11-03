import type { ParamMap } from '@angular/router';
import type { ProductSummary } from '../../core/api/api.models';

/** Three columns still fit side by side on a phone. */
export const MAX_COMPARE = 3;

export type CompareItem = Pick<ProductSummary, 'sku' | 'displayName'>;

/** Adds the product, or removes it if it is already selected. A full selection does not change. */
export function toggleItem(items: readonly CompareItem[], item: CompareItem): readonly CompareItem[] {
  if (items.some((selected) => selected.sku === item.sku)) {
    return items.filter((selected) => selected.sku !== item.sku);
  }
  if (items.length >= MAX_COMPARE) {
    return items;
  }
  return [...items, { sku: item.sku, displayName: item.displayName }];
}

/** Unreadable JSON or a non-array counts as no selection; malformed entries are dropped. */
export function parseStoredItems(raw: string): CompareItem[] {
  try {
    // Invalid JSON throws, and so does anything that is not an array (it has no .filter).
    return (JSON.parse(raw) as unknown[])
      .filter(isCompareItem)
      .slice(0, MAX_COMPARE)
      .map(({ sku, displayName }) => ({ sku, displayName }));
  } catch {
    return [];
  }
}

/** SKUs from `/compare?sku=…`: trimmed, without blanks or duplicates, at most MAX_COMPARE. */
export function parseCompareSkus(params: ParamMap): string[] {
  const skus = params
    .getAll('sku')
    .map((sku) => sku.trim())
    .filter((sku) => sku.length > 0);
  return [...new Set(skus)].slice(0, MAX_COMPARE);
}

function isCompareItem(value: unknown): value is CompareItem {
  const item = value as Partial<CompareItem> | null;
  return typeof item?.sku === 'string' && typeof item.displayName === 'string';
}
