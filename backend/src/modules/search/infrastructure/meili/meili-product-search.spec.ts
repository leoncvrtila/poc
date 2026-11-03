import { Logger } from '@nestjs/common';
import { SearchUnavailableError } from '../../domain/ports';
import type { ProductSearchQuery } from '../../domain/search-query';
import type { MeiliClient } from './meili-client';
import { MeiliError } from './meili-client';
import { MeiliProductSearch } from './meili-product-search';

const query: ProductSearchQuery = {
  q: 'x',
  sort: 'relevance',
  page: 1,
  pageSize: 20,
  filters: { function: [], applicationArea: [], region: [], status: [], certification: [] },
};

describe('MeiliProductSearch error mapping', () => {
  let request: jest.Mock;
  let engine: MeiliProductSearch;

  beforeEach(() => {
    request = jest.fn();
    engine = new MeiliProductSearch({ request } as unknown as MeiliClient, 'products');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['a network error or timeout', null],
    ['500', 500],
    ['503', 503],
    ['599', 599],
    ['401', 401],
    ['403', 403],
    ['404', 404],
    ['429', 429],
  ])('maps %s to SearchUnavailableError', async (_label, status) => {
    const failure = new MeiliError('boom', status, null);
    request.mockRejectedValueOnce(failure);

    const error = await engine.search(query).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SearchUnavailableError);
    expect((error as SearchUnavailableError).cause).toBe(failure);
  });

  it.each([400, 402, 405, 413, 422, 499])('rethrows a %i MeiliError as it is', async (status) => {
    const failure = new MeiliError('invalid query', status, 'invalid_search_filter');
    request.mockRejectedValueOnce(failure);

    await expect(engine.search(query)).rejects.toBe(failure);
  });

  it('maps a non-Meili error (such as a failed fetch) to SearchUnavailableError', async () => {
    request.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(engine.search(query)).rejects.toBeInstanceOf(SearchUnavailableError);
  });
});
