import { convertToParamMap } from '@angular/router';
import {
  activeFilters,
  DEFAULT_STATUSES,
  effectiveSort,
  emptyQuery,
  parseSearchQuery,
  SORT_CHOICES,
  toggleFacetValue,
  toQueryParams,
} from './search-query';

describe('parseSearchQuery', () => {
  it('returns defaults for an empty URL', () => {
    expect(parseSearchQuery(convertToParamMap({}))).toEqual(emptyQuery());
    expect(emptyQuery().status).toEqual(DEFAULT_STATUSES);
  });

  it('reads repeated params and ignores invalid values', () => {
    const query = parseSearchQuery(
      convertToParamMap({
        q: ' laureth ',
        function: ['Surfactant', 'Emulsifier'],
        certification: 'Vegan',
        status: ['DISCONTINUED', 'BOGUS'],
        sort: 'price',
        page: '-3',
        pageSize: '500',
      }),
    );

    expect(query).toEqual({
      ...emptyQuery(),
      q: 'laureth',
      function: ['Surfactant', 'Emulsifier'],
      certification: ['Vegan'],
      status: ['DISCONTINUED'],
      sort: null,
      page: 1,
      pageSize: 50,
    });
  });
});

describe('toQueryParams', () => {
  it('omits defaults to keep shared links short', () => {
    expect(toQueryParams(emptyQuery())).toEqual({});
  });

  it('round-trips through the URL', () => {
    const query = { ...emptyQuery(), q: 'gel', region: ['EMEA'], status: ['ACTIVE' as const], sort: '-rating' as const, page: 3 };
    expect(parseSearchQuery(convertToParamMap(toQueryParams(query)))).toEqual(query);
  });
});

describe('toggleFacetValue', () => {
  it('adds and removes a value and resets to page 1', () => {
    const added = toggleFacetValue({ ...emptyQuery(), page: 4 }, 'function', 'Solvent');
    expect(added).toMatchObject({ function: ['Solvent'], page: 1 });
    expect(toggleFacetValue(added, 'function', 'Solvent').function).toEqual([]);
  });

  it('falls back to the default statuses when the last status is removed', () => {
    const query = { ...emptyQuery(), status: ['ACTIVE' as const] };
    expect(toggleFacetValue(query, 'status', 'ACTIVE').status).toEqual(DEFAULT_STATUSES);
  });
});

describe('activeFilters', () => {
  it('lists chosen facet values but not the default status selection', () => {
    expect(activeFilters({ ...emptyQuery(), region: ['EMEA'] })).toEqual([{ facet: 'region', value: 'EMEA', label: 'EMEA' }]);
    expect(activeFilters({ ...emptyQuery(), status: ['DISCONTINUED'] })).toEqual([
      { facet: 'status', value: 'DISCONTINUED', label: 'Discontinued' },
    ]);
  });
});

describe('effectiveSort', () => {
  it('uses relevance for text queries and name otherwise', () => {
    expect(effectiveSort(emptyQuery())).toBe('name');
    expect(effectiveSort({ ...emptyQuery(), q: 'gel' })).toBe('relevance');
    expect(effectiveSort({ ...emptyQuery(), q: 'gel', sort: '-rating' })).toBe('-rating');
  });
});

describe('parseSearchQuery (details)', () => {
  it('reads every list facet, trims values and drops empty ones', () => {
    const query = parseSearchQuery(
      convertToParamMap({
        function: [' A ', '', '   '],
        applicationArea: 'Care',
        region: ['EMEA', 'APAC'],
        certification: ' Vegan',
      }),
    );
    expect(query.function).toEqual(['A']);
    expect(query.applicationArea).toEqual(['Care']);
    expect(query.region).toEqual(['EMEA', 'APAC']);
    expect(query.certification).toEqual(['Vegan']);
  });

  it('accepts every known status and sort option', () => {
    expect(parseSearchQuery(convertToParamMap({ status: ['PHASE_OUT'] })).status).toEqual(['PHASE_OUT']);
    expect(parseSearchQuery(convertToParamMap({ status: ['ACTIVE', 'PHASE_OUT', 'DISCONTINUED'] })).status).toEqual([
      'ACTIVE',
      'PHASE_OUT',
      'DISCONTINUED',
    ]);
    for (const sort of ['relevance', 'name', '-launchYear', '-rating']) {
      expect(parseSearchQuery(convertToParamMap({ sort })).sort).toBe(sort);
    }
  });

  it('only accepts positive integers for paging', () => {
    expect(parseSearchQuery(convertToParamMap({ pageSize: '1' })).pageSize).toBe(1);
    expect(parseSearchQuery(convertToParamMap({ page: '0', pageSize: '0' }))).toMatchObject({ page: 1, pageSize: 20 });
    expect(parseSearchQuery(convertToParamMap({ page: 'abc', pageSize: 'abc' }))).toMatchObject({ page: 1, pageSize: 20 });
    expect(parseSearchQuery(convertToParamMap({ page: '2.5', pageSize: '2.5' }))).toMatchObject({ page: 1, pageSize: 20 });
    expect(parseSearchQuery(convertToParamMap({ page: '7', pageSize: '30' }))).toMatchObject({ page: 7, pageSize: 30 });
  });
});

describe('toQueryParams (details)', () => {
  it('writes a non-default page size', () => {
    expect(toQueryParams({ ...emptyQuery(), pageSize: 50 })).toEqual({ pageSize: '50' });
  });

  it('writes a status selection that differs from the default but has the same size', () => {
    expect(toQueryParams({ ...emptyQuery(), status: ['ACTIVE', 'DISCONTINUED'] })).toEqual({ status: ['ACTIVE', 'DISCONTINUED'] });
  });

  it('treats the default statuses as default regardless of order', () => {
    expect(toQueryParams({ ...emptyQuery(), status: ['PHASE_OUT', 'ACTIVE'] })).toEqual({});
  });
});

describe('toggleFacetValue (details)', () => {
  it('removes only the toggled value', () => {
    const query = { ...emptyQuery(), region: ['EMEA', 'APAC'] };
    expect(toggleFacetValue(query, 'region', 'EMEA').region).toEqual(['APAC']);
  });

  it('keeps the remaining statuses when one of several is removed', () => {
    expect(toggleFacetValue(emptyQuery(), 'status', 'ACTIVE').status).toEqual(['PHASE_OUT']);
  });
});

describe('SORT_CHOICES', () => {
  it('lists the sort options with their labels', () => {
    expect(SORT_CHOICES).toEqual([
      { label: 'Best match', value: 'relevance' },
      { label: 'Name (A–Z)', value: 'name' },
      { label: 'Newest launch', value: '-launchYear' },
      { label: 'Top rated', value: '-rating' },
    ]);
  });
});
