import { loadConfig } from './app-config';

describe('loadConfig', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

  it('applies defaults for optional settings', () => {
    const config = loadConfig(base);
    expect(config).toEqual({
      port: 3000,
      databaseUrl: base.DATABASE_URL,
      meili: { url: 'http://localhost:7700', apiKey: '', index: 'products' },
      pimExportPath: '../data/products.csv',
      seedCatalogSize: 0,
      reviewRateLimit: { limit: 20, ttlMs: 600_000 },
      outbox: { pollMs: 1000, relayEnabled: true },
    });
  });

  it('reads explicit values', () => {
    const config = loadConfig({
      ...base,
      PORT: '4000',
      MEILI_URL: 'http://meili:7700',
      MEILI_MASTER_KEY: 'secret',
      MEILI_INDEX: 'products_test',
      REVIEW_RATE_LIMIT: '2',
      SEED_CATALOG_SIZE: '500000',
      OUTBOX_RELAY_ENABLED: 'false',
    });
    expect(config.port).toBe(4000);
    expect(config.meili).toEqual({ url: 'http://meili:7700', apiKey: 'secret', index: 'products_test' });
    expect(config.reviewRateLimit.limit).toBe(2);
    expect(config.seedCatalogSize).toBe(500_000);
    expect(config.outbox.relayEnabled).toBe(false);
  });

  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow('Missing required environment variable DATABASE_URL');
  });

  it('rejects non-integer numbers', () => {
    expect(() => loadConfig({ ...base, PORT: 'abc' })).toThrow('PORT must be an integer');
    expect(() => loadConfig({ ...base, SEED_CATALOG_SIZE: 'abc' })).toThrow('SEED_CATALOG_SIZE must be an integer');
  });

  it('rejects a negative seed catalogue size and accepts 0', () => {
    expect(() => loadConfig({ ...base, SEED_CATALOG_SIZE: '-1' })).toThrow('SEED_CATALOG_SIZE must be at least 0');
    expect(loadConfig({ ...base, SEED_CATALOG_SIZE: '0' }).seedCatalogSize).toBe(0);
  });
});
