import type { FacetName, SearchFilters, SortOption } from '../../domain/search-query';

export const FACET_ATTRIBUTES: Record<FacetName, string> = {
  function: 'function',
  applicationArea: 'applicationArea',
  region: 'region',
  status: 'status',
  certification: 'certifications',
};

/** OR-within-facet facets; their counts are computed without their own filter. */
export const DISJUNCTIVE_FACETS: readonly FacetName[] = ['function', 'applicationArea', 'region', 'status'];

export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function equals(attribute: string, value: string): string {
  return `${attribute} = "${escapeFilterValue(value)}"`;
}

/** Meilisearch array syntax: outer array = AND, inner array = OR. */
export function buildFilter(filters: SearchFilters, omit?: FacetName): string[][] {
  const clauses: string[][] = [];
  for (const facet of DISJUNCTIVE_FACETS) {
    if (facet !== omit && filters[facet].length > 0) {
      clauses.push(filters[facet].map((value) => equals(FACET_ATTRIBUTES[facet], value)));
    }
  }
  for (const certification of filters.certification) {
    clauses.push([equals(FACET_ATTRIBUTES.certification, certification)]);
  }
  return clauses;
}

export function toMeiliSort(sort: SortOption): string[] | undefined {
  switch (sort) {
    // Stryker disable next-line StringLiteral: an unmatched case falls through to the implicit undefined, same as 'relevance'
    case 'relevance':
      return undefined;
    case 'name':
      return ['displayName:asc'];
    case '-launchYear':
      return ['launchYear:desc'];
    case '-rating':
      return ['ratingAverage:desc', 'reviewCount:desc'];
  }
}
