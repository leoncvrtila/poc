import type { SearchFilters } from '../../domain/search-query';
import { buildFilter, escapeFilterValue, toMeiliSort } from './meili-query';

const none: SearchFilters = { function: [], applicationArea: [], region: [], status: [], certification: [] };

describe('escapeFilterValue', () => {
  it('escapes backslashes and double quotes', () => {
    expect(escapeFilterValue('a"b\\c')).toBe('a\\"b\\\\c');
  });
});

describe('buildFilter', () => {
  it('ORs values within a facet and ANDs facets', () => {
    expect(buildFilter({ ...none, function: ['Surfactant', 'Emulsifier'], region: ['EMEA'] })).toEqual([
      ['function = "Surfactant"', 'function = "Emulsifier"'],
      ['region = "EMEA"'],
    ]);
  });

  it('requires every selected certification (AND)', () => {
    expect(buildFilter({ ...none, certification: ['Halal', 'Vegan'] })).toEqual([
      ['certifications = "Halal"'],
      ['certifications = "Vegan"'],
    ]);
  });

  it('can leave out one facet for disjunctive facet counts', () => {
    expect(buildFilter({ ...none, function: ['Surfactant'], status: ['ACTIVE'] }, 'function')).toEqual([
      ['status = "ACTIVE"'],
    ]);
  });

  it('keeps hostile input inside the quoted value', () => {
    const [[clause]] = buildFilter({ ...none, function: ['x" OR status = "DISCONTINUED'] });
    expect(clause).toBe('function = "x\\" OR status = \\"DISCONTINUED"');
  });

  it('maps every disjunctive facet to its index attribute', () => {
    expect(buildFilter({ ...none, applicationArea: ['Home Care'], status: ['ACTIVE'] })).toEqual([
      ['applicationArea = "Home Care"'],
      ['status = "ACTIVE"'],
    ]);
  });
});

describe('toMeiliSort', () => {
  it.each([
    ['relevance', undefined],
    ['name', ['displayName:asc']],
    ['-launchYear', ['launchYear:desc']],
    ['-rating', ['ratingAverage:desc', 'reviewCount:desc']],
  ] as const)('maps %p', (sort, expected) => {
    expect(toMeiliSort(sort)).toEqual(expected);
  });
});
