import type { CatalogFacade, ProductView } from '../../../catalog';
import type { ReviewsFacade } from '../../../reviews';
import { SearchUnavailableError } from '../../domain/ports';
import type { ProductSearchQuery } from '../../domain/search-query';
import { CatalogBackedSearch } from './catalog-backed-search';

const query: ProductSearchQuery = {
  q: 'sodium',
  sort: '-rating',
  page: 2,
  pageSize: 10,
  filters: { function: ['Surfactant'], applicationArea: [], region: [], status: ['ACTIVE'], certification: [] },
};

const product: ProductView = {
  sku: 'P-1',
  name: 'Sodium Thing',
  displayName: 'Sodium Thing',
  chemicalName: 'Sodium',
  function: 'Surfactant',
  applicationArea: 'Coatings',
  region: 'EU',
  certifications: [],
  status: 'ACTIVE',
  launchYear: 2020,
  description: 'd',
  listed: true,
  updatedAt: new Date('2026-01-01'),
};

describe('CatalogBackedSearch', () => {
  const facetCounts = { function: { Surfactant: 1 }, applicationArea: {}, region: {}, status: {}, certification: {} };
  let searchProducts: jest.Mock;
  let getRatingSummaries: jest.Mock;
  let engine: CatalogBackedSearch;

  beforeEach(() => {
    searchProducts = jest.fn().mockResolvedValue({ items: [product], total: 11, facetCounts });
    getRatingSummaries = jest.fn().mockResolvedValue(new Map([['P-1', { average: 4.5, count: 2 }]]));
    engine = new CatalogBackedSearch(
      { searchProducts } as unknown as CatalogFacade,
      { getRatingSummaries } as unknown as ReviewsFacade,
    );
  });

  it('maps the catalog page to a degraded result with ratings', async () => {
    const result = await engine.search(query);

    expect(result).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
      degraded: true,
      items: [{ sku: 'P-1', ratingAverage: 4.5, reviewCount: 2 }],
    });
    expect(result.facets.function).toEqual([{ value: 'Surfactant', count: 1, selected: true }]);
    expect(getRatingSummaries).toHaveBeenCalledWith(['P-1']);
  });

  it('offers only the pages inside the result window, like Meilisearch', async () => {
    searchProducts.mockResolvedValue({ items: [product], total: 464_807, facetCounts });

    const result = await engine.search({ ...query, pageSize: 20 });

    expect(result).toMatchObject({ total: 464_807, totalPages: 500 });
  });

  it('sorts by name when asked for rating, which the catalog cannot do', async () => {
    await engine.search(query);
    expect(searchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'name' }));

    await engine.search({ ...query, sort: '-launchYear' });
    expect(searchProducts).toHaveBeenLastCalledWith(expect.objectContaining({ sort: '-launchYear' }));
  });

  it('reports a failing database as unavailable search', async () => {
    searchProducts.mockRejectedValue(new Error('db down'));

    const error = await engine.search(query).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SearchUnavailableError);
    expect(error).toMatchObject({ message: 'Fallback search failed: db down' });
  });
});
