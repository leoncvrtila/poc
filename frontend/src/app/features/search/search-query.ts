import type { ParamMap, Params } from '@angular/router';
import type { FacetName, ProductStatus, SortOption } from '../../core/api/api.models';
import { STATUS_LABEL } from '../../shared/product-status';

export interface SearchQuery {
  q: string;
  function: string[];
  applicationArea: string[];
  region: string[];
  certification: string[];
  status: ProductStatus[];
  /** null = default (relevance when searching, name when browsing) */
  sort: SortOption | null;
  page: number;
  pageSize: number;
}

export interface ActiveFilter {
  facet: FacetName;
  value: string;
  label: string;
}

export const DEFAULT_STATUSES: ProductStatus[] = ['ACTIVE', 'PHASE_OUT'];
export const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const STATUSES: ProductStatus[] = ['ACTIVE', 'PHASE_OUT', 'DISCONTINUED'];
const SORTS: SortOption[] = ['relevance', 'name', '-launchYear', '-rating'];
const LIST_FACETS = ['function', 'applicationArea', 'region', 'certification'] as const;

export const SORT_CHOICES: { label: string; value: SortOption }[] = [
  { label: 'Best match', value: 'relevance' },
  { label: 'Name (A–Z)', value: 'name' },
  { label: 'Newest launch', value: '-launchYear' },
  { label: 'Top rated', value: '-rating' },
];

export function emptyQuery(): SearchQuery {
  return {
    q: '',
    function: [],
    applicationArea: [],
    region: [],
    certification: [],
    status: [...DEFAULT_STATUSES],
    sort: null,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

function positiveInt(raw: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return Math.min(value, max);
}

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

export function parseSearchQuery(params: ParamMap): SearchQuery {
  const list = (key: string): string[] =>
    params
      .getAll(key)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  const status = list('status').filter((value): value is ProductStatus => STATUSES.includes(value as ProductStatus));
  const sort = params.get('sort') as SortOption | null;

  return {
    q: (params.get('q') ?? '').trim(),
    function: list('function'),
    applicationArea: list('applicationArea'),
    region: list('region'),
    certification: list('certification'),
    status: status.length > 0 ? status : [...DEFAULT_STATUSES],
    sort: sort && SORTS.includes(sort) ? sort : null,
    page: positiveInt(params.get('page'), 1),
    pageSize: positiveInt(params.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

export function toQueryParams(query: SearchQuery): Params {
  const params: Params = {};
  if (query.q) {
    params['q'] = query.q;
  }
  for (const facet of LIST_FACETS) {
    if (query[facet].length > 0) {
      params[facet] = [...query[facet]];
    }
  }
  if (!sameValues(query.status, DEFAULT_STATUSES)) {
    params['status'] = [...query.status];
  }
  if (query.sort) {
    params['sort'] = query.sort;
  }
  if (query.page > 1) {
    params['page'] = String(query.page);
  }
  if (query.pageSize !== DEFAULT_PAGE_SIZE) {
    params['pageSize'] = String(query.pageSize);
  }
  return params;
}

export function toggleFacetValue(query: SearchQuery, facet: FacetName, value: string): SearchQuery {
  const current: string[] = query[facet];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  if (facet === 'status') {
    const statuses = next as ProductStatus[];
    return { ...query, status: statuses.length > 0 ? statuses : [...DEFAULT_STATUSES], page: 1 };
  }
  return { ...query, [facet]: next, page: 1 };
}

export function activeFilters(query: SearchQuery): ActiveFilter[] {
  const filters: ActiveFilter[] = LIST_FACETS.flatMap((facet) =>
    query[facet].map((value) => ({ facet, value, label: value })),
  );
  if (!sameValues(query.status, DEFAULT_STATUSES)) {
    filters.push(...query.status.map((value) => ({ facet: 'status' as const, value, label: STATUS_LABEL[value] })));
  }
  return filters;
}

export function effectiveSort(query: SearchQuery): SortOption {
  return query.sort ?? (query.q ? 'relevance' : 'name');
}
