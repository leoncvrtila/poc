import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { configureApp } from '../src/app.setup';
import { CatalogImportService, CatalogModule } from '../src/modules/catalog';
import { ReviewsModule } from '../src/modules/reviews';
import { SearchModule } from '../src/modules/search';
import type { ProductSearchResult } from '../src/modules/search/domain/search-result';
import { MeiliClient } from '../src/modules/search/infrastructure/meili/meili-client';
import { AppConfigModule } from '../src/shared/config/app-config.module';
import { OutboxModule, OutboxRelay } from '../src/shared/outbox';
import { PrismaModule } from '../src/shared/prisma/prisma.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetDatabase } from './support/database';

describe('Import → outbox → Meilisearch → API (integration)', () => {
  let app: INestApplication;
  const indexUid = `products_flow_${Date.now()}`;
  const originalIndex = process.env.MEILI_INDEX;

  async function search(path: string): Promise<ProductSearchResult> {
    const response = await request(app.getHttpServer()).get(path).expect(200);
    return response.body as ProductSearchResult;
  }

  beforeAll(async () => {
    process.env.MEILI_INDEX = indexUid;
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, OutboxModule, CatalogModule, ReviewsModule, SearchModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    await resetDatabase(app.get(PrismaService));
    const csv = readFileSync(resolve(__dirname, '../../data/products.csv'), 'utf8');
    await app.get(CatalogImportService).importContent(csv, { sourceFile: 'test.csv' });
    await app.get(OutboxRelay).drain();
  });

  afterAll(async () => {
    await app.get(MeiliClient).runTask('DELETE', `/indexes/${indexUid}`);
    await app.close();
    if (originalIndex === undefined) {
      delete process.env.MEILI_INDEX;
    } else {
      process.env.MEILI_INDEX = originalIndex;
    }
  });

  it('serves active and phasing-out products by default', async () => {
    const result = await search('/api/products');

    expect(result.degraded).toBe(false);
    expect(result.total).toBe(170);
    expect(result.facets.status).toEqual([
      { value: 'ACTIVE', count: 140, selected: true },
      { value: 'PHASE_OUT', count: 30, selected: true },
      { value: 'DISCONTINUED', count: 30, selected: false },
    ]);
  });

  it('combines text search and facets', async () => {
    const result = await search('/api/products?q=laureth&function=Surfactant');

    expect(result.items.map((item) => item.sku)).toContain('P-10001');
  });

  it('keeps OR-facet counts disjunctive', async () => {
    const result = await search('/api/products?function=Surfactant');

    const emulsifier = result.facets.function.find((entry) => entry.value === 'Emulsifier');
    expect(emulsifier?.count).toBeGreaterThan(0);
  });

  it('finds a SKU exactly instead of returning the whole catalogue', async () => {
    const exact = await search('/api/products?q=P-10004');
    expect(exact.total).toBe(1);
    expect(exact.items.map((item) => item.sku)).toEqual(['P-10004']);

    const prefix = await search('/api/products?q=P-100&pageSize=50');
    expect(prefix.total).toBeLessThan(170);
    expect(prefix.items.length).toBeGreaterThan(0);
    expect(prefix.items.every((item) => item.sku.startsWith('P-100'))).toBe(true);
  });

  it('reflects a new review in rating sort once the outbox is drained', async () => {
    await request(app.getHttpServer())
      .post('/api/products/P-10004/reviews')
      .send({ authorName: 'Ana K.', rating: 5, comment: 'Excellent cold-process emulsifier.' })
      .expect(201);
    await app.get(OutboxRelay).drain();

    const result = await search('/api/products?sort=-rating&pageSize=1');
    expect(result.items[0]).toMatchObject({ sku: 'P-10004', ratingAverage: 5, reviewCount: 1 });
  });

  it('removes a delisted product from search', async () => {
    const csv = readFileSync(resolve(__dirname, '../../data/products.csv'), 'utf8');
    const withoutP10004 = csv
      .split('\n')
      .filter((line) => !line.startsWith('P-10004,'))
      .join('\n');
    await app.get(CatalogImportService).importContent(withoutP10004, { sourceFile: 'test.csv' });
    await app.get(OutboxRelay).drain();

    const result = await search('/api/products?q=P-10004');
    expect(result.total).toBe(0);
    expect(result.items.map((item) => item.sku)).not.toContain('P-10004');
  });
});

describe('Search API when Meilisearch is unavailable (integration)', () => {
  let app: INestApplication;
  const originalUrl = process.env.MEILI_URL;

  beforeAll(async () => {
    process.env.MEILI_URL = 'http://127.0.0.1:1';
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, OutboxModule, CatalogModule, ReviewsModule, SearchModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    await resetDatabase(app.get(PrismaService));
    const csv = readFileSync(resolve(__dirname, '../../data/products.csv'), 'utf8');
    await app.get(CatalogImportService).importContent(csv, { sourceFile: 'test.csv' });
  });

  afterAll(async () => {
    await app.close();
    if (originalUrl === undefined) {
      delete process.env.MEILI_URL;
    } else {
      process.env.MEILI_URL = originalUrl;
    }
  });

  it('serves a limited search from Postgres and flags it as degraded', async () => {
    const response = await request(app.getHttpServer()).get('/api/products?q=laureth&function=Surfactant').expect(200);
    const result = response.body as ProductSearchResult;

    expect(result.degraded).toBe(true);
    expect(result.items.map((item) => item.sku)).toContain('P-10001');
    expect(result.total).toBeGreaterThan(0);
    expect(result.facets.function.find((entry) => entry.value === 'Surfactant')).toMatchObject({ selected: true });
    expect(result.facets.region.length).toBeGreaterThan(0);
  });

  it('applies the default status filter and paginates', async () => {
    const response = await request(app.getHttpServer()).get('/api/products?pageSize=5&page=2').expect(200);
    const result = response.body as ProductSearchResult;

    expect(result).toMatchObject({ degraded: true, page: 2, pageSize: 5, total: 170, totalPages: 34 });
    expect(result.items).toHaveLength(5);
  });
});
