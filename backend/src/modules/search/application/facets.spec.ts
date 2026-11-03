import type { SearchFilters } from '../domain/search-query';
import { buildFacets } from './facets';

const none: SearchFilters = { function: [], applicationArea: [], region: [], status: [], certification: [] };

describe('buildFacets', () => {
  it('turns distributions into sorted values with selection flags', () => {
    const facets = buildFacets(
      {
        function: { Solvent: 3, Emollient: 2 },
        applicationArea: {},
        region: {},
        status: { DISCONTINUED: 1, ACTIVE: 5 },
        certification: {},
      },
      { ...none, function: ['Solvent'], status: ['ACTIVE'] },
    );

    expect(facets.function).toEqual([
      { value: 'Emollient', count: 2, selected: false },
      { value: 'Solvent', count: 3, selected: true },
    ]);
    expect(facets.status.map((value) => value.value)).toEqual(['ACTIVE', 'DISCONTINUED']);
  });

  it('keeps selected values visible even when they have no matches', () => {
    const facets = buildFacets(
      { function: {}, applicationArea: {}, region: {}, status: {}, certification: {} },
      { ...none, region: ['EMEA'] },
    );

    expect(facets.region).toEqual([{ value: 'EMEA', count: 0, selected: true }]);
  });

  it('does not read inherited object properties for selected values', () => {
    const facets = buildFacets(
      { function: {}, applicationArea: {}, region: {}, status: {}, certification: {} },
      { ...none, region: ['constructor'] },
    );

    expect(facets.region).toEqual([{ value: 'constructor', count: 0, selected: true }]);
  });

  it('treats a facet missing from the distributions as having no counts', () => {
    const facets = buildFacets({} as Parameters<typeof buildFacets>[0], { ...none, function: ['Solvent'] });

    expect(facets.function).toEqual([{ value: 'Solvent', count: 0, selected: true }]);
    expect(facets.region).toEqual([]);
  });

  it('orders unknown statuses alphabetically among themselves', () => {
    const facets = buildFacets(
      {
        function: {},
        applicationArea: {},
        region: {},
        status: { ZETA: 1, ALPHA: 1, ACTIVE: 1 },
        certification: {},
      },
      none,
    );

    expect(facets.status.map((value) => value.value)).toEqual(['ACTIVE', 'ALPHA', 'ZETA']);
  });

  it('sorts unknown statuses last', () => {
    const facets = buildFacets(
      {
        function: {},
        applicationArea: {},
        region: {},
        status: { MYSTERY: 1, DISCONTINUED: 1, ACTIVE: 2 },
        certification: {},
      },
      none,
    );

    expect(facets.status.map((value) => value.value)).toEqual(['ACTIVE', 'DISCONTINUED', 'MYSTERY']);
  });

  it('orders statuses by lifecycle rank rather than alphabetically, with unknown ones last', () => {
    const facets = buildFacets(
      {
        function: {},
        applicationArea: {},
        region: {},
        status: { AAA: 1, DISCONTINUED: 1, PHASE_OUT: 1, ACTIVE: 1 },
        certification: {},
      },
      none,
    );

    expect(facets.status.map((value) => value.value)).toEqual(['ACTIVE', 'PHASE_OUT', 'DISCONTINUED', 'AAA']);
  });

  it('sorts non-status facets alphabetically even when values look like statuses', () => {
    const facets = buildFacets(
      {
        function: { PHASE_OUT: 1, DISCONTINUED: 1, ACTIVE: 1 },
        applicationArea: {},
        region: {},
        status: {},
        certification: {},
      },
      none,
    );

    expect(facets.function.map((value) => value.value)).toEqual(['ACTIVE', 'DISCONTINUED', 'PHASE_OUT']);
  });
});
