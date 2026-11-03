import { Logger } from '@nestjs/common';
import { SearchUnavailableError } from '../domain/ports';
import type { ProductSearchQuery } from '../domain/search-query';
import type { ProductSearchResult } from '../domain/search-result';
import { FALLBACK_WINDOW_MS, ResilientProductSearch } from './resilient-product-search';

const query: ProductSearchQuery = {
  q: 'x',
  sort: 'relevance',
  page: 1,
  pageSize: 20,
  filters: { function: [], applicationArea: [], region: [], status: [], certification: [] },
};

function result(degraded: boolean): ProductSearchResult {
  return {
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
    facets: { function: [], applicationArea: [], region: [], status: [], certification: [] },
    degraded,
  };
}

describe('ResilientProductSearch', () => {
  const primaryResult = result(false);
  const fallbackResult = result(true);
  let now: number;
  let primary: { search: jest.Mock };
  let fallback: { search: jest.Mock };
  let engine: ResilientProductSearch;
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    now = 0;
    primary = { search: jest.fn().mockResolvedValue(primaryResult) };
    fallback = { search: jest.fn().mockResolvedValue(fallbackResult) };
    engine = new ResilientProductSearch(primary, fallback, () => now);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function failPrimaryOnce(): void {
    primary.search.mockRejectedValueOnce(new SearchUnavailableError('down'));
  }

  it('uses the primary engine while it is healthy', async () => {
    await expect(engine.search(query)).resolves.toBe(primaryResult);

    expect(primary.search).toHaveBeenCalledWith(query);
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it('keeps using the primary on every request while it is healthy', async () => {
    await engine.search(query);
    await expect(engine.search(query)).resolves.toBe(primaryResult);

    expect(primary.search).toHaveBeenCalledTimes(2);
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it('serves the fallback when the primary is unavailable', async () => {
    failPrimaryOnce();

    await expect(engine.search(query)).resolves.toBe(fallbackResult);
    expect(fallback.search).toHaveBeenCalledWith(query);
  });

  it('skips the primary until the fallback window has passed', async () => {
    failPrimaryOnce();
    await engine.search(query);

    now = FALLBACK_WINDOW_MS - 1;
    await expect(engine.search(query)).resolves.toBe(fallbackResult);

    expect(primary.search).toHaveBeenCalledTimes(1);
    expect(fallback.search).toHaveBeenCalledTimes(2);
  });

  it('tries the primary again after the window and keeps using it once it recovered', async () => {
    failPrimaryOnce();
    await engine.search(query);

    now = FALLBACK_WINDOW_MS;
    await expect(engine.search(query)).resolves.toBe(primaryResult);
    await expect(engine.search(query)).resolves.toBe(primaryResult);

    expect(primary.search).toHaveBeenCalledTimes(3);
    expect(fallback.search).toHaveBeenCalledTimes(1);
  });

  it('rethrows unexpected primary errors without using the fallback', async () => {
    const failure = new Error('bug');
    primary.search.mockRejectedValueOnce(failure);

    await expect(engine.search(query)).rejects.toBe(failure);
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it('propagates an unavailable fallback', async () => {
    const failure = new SearchUnavailableError('both down');
    failPrimaryOnce();
    fallback.search.mockRejectedValueOnce(failure);

    await expect(engine.search(query)).rejects.toBe(failure);
  });

  it('logs once per outage and once on recovery', async () => {
    failPrimaryOnce();
    await engine.search(query);
    now = FALLBACK_WINDOW_MS;
    failPrimaryOnce();
    await engine.search(query);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('down'));
    expect(log).not.toHaveBeenCalled();

    now = 2 * FALLBACK_WINDOW_MS;
    await engine.search(query);
    await engine.search(query);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('available again'));
  });

  it('uses the system clock by default', async () => {
    const real = new ResilientProductSearch(primary, fallback);
    failPrimaryOnce();

    await expect(real.search(query)).resolves.toBe(fallbackResult);
    await expect(real.search(query)).resolves.toBe(fallbackResult);

    expect(primary.search).toHaveBeenCalledTimes(1);
  });

  it('logs a new outage after a recovery', async () => {
    failPrimaryOnce();
    await engine.search(query);
    now = FALLBACK_WINDOW_MS;
    await engine.search(query);
    failPrimaryOnce();
    await engine.search(query);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('lets only one request probe the primary when the window has expired', async () => {
    failPrimaryOnce();
    await engine.search(query);
    now = FALLBACK_WINDOW_MS;
    let release!: (value: ProductSearchResult) => void;
    primary.search.mockReturnValueOnce(new Promise<ProductSearchResult>((resolve) => (release = resolve)));

    const probe = engine.search(query);
    const concurrent = engine.search(query);
    await expect(concurrent).resolves.toBe(fallbackResult);
    release(primaryResult);
    await expect(probe).resolves.toBe(primaryResult);

    expect(primary.search).toHaveBeenCalledTimes(2);
  });

  it('keeps the fallback window running while a probe is in flight', async () => {
    failPrimaryOnce();
    await engine.search(query);
    now = FALLBACK_WINDOW_MS;
    failPrimaryOnce();
    await engine.search(query);

    now = 2 * FALLBACK_WINDOW_MS - 1;
    await expect(engine.search(query)).resolves.toBe(fallbackResult);
    expect(primary.search).toHaveBeenCalledTimes(2);
  });
});
