import { PRODUCT_STATUSES } from '../../catalog';
import { FACETS, type FacetName, type SearchFilters } from '../domain/search-query';
import type { FacetValue } from '../domain/search-result';

export type FacetDistributions = Record<FacetName, Record<string, number>>;

const STATUS_ORDER: readonly string[] = PRODUCT_STATUSES;

function statusRank(value: string): number {
  const index = STATUS_ORDER.indexOf(value);
  return index === -1 ? Infinity : index;
}

function compare(facet: FacetName, a: FacetValue, b: FacetValue): number {
  if (facet === 'status') {
    return statusRank(a.value) - statusRank(b.value) || a.value.localeCompare(b.value, 'en');
  }
  return a.value.localeCompare(b.value, 'en');
}

export function buildFacets(
  distributions: FacetDistributions,
  filters: SearchFilters,
): Record<FacetName, FacetValue[]> {
  const result = {} as Record<FacetName, FacetValue[]>;
  for (const facet of FACETS) {
    const counts = distributions[facet] ?? {};
    const selected = new Set(filters[facet]);
    const values = new Set([...Object.keys(counts), ...selected]);
    result[facet] = [...values]
      .map((value) => ({
        value,
        count: Object.hasOwn(counts, value) ? counts[value] : 0,
        selected: selected.has(value),
      }))
      .sort((a, b) => compare(facet, a, b));
  }
  return result;
}
