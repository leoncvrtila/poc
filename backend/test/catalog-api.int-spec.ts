import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { configureApp } from '../src/app.setup';
import { CatalogFacade, CatalogImportService, CatalogModule } from '../src/modules/catalog';
import { AppConfigModule } from '../src/shared/config/app-config.module';
import { PrismaModule } from '../src/shared/prisma/prisma.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetDatabase } from './support/database';

const PIM_EXPORT = readFileSync(resolve(__dirname, '../../data/products.csv'), 'utf8');

describe('Catalog API (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, CatalogModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    await app.get(CatalogImportService).importContent(PIM_EXPORT, { sourceFile: 'test.csv' });
    await prisma.product.update({ where: { sku: 'P-10002' }, data: { listed: false } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a product by SKU and falls back to the SKU as display name', async () => {
    const response = await request(app.getHttpServer()).get('/api/products/P-10119').expect(200);
    expect(response.body).toMatchObject({
      sku: 'P-10119',
      name: null,
      displayName: 'P-10119',
      status: 'ACTIVE',
      listed: true,
    });
  });

  it('still returns delisted products so shared links keep working', async () => {
    const response = await request(app.getHttpServer()).get('/api/products/P-10002').expect(200);
    expect(response.body.listed).toBe(false);
  });

  it('returns 404 for an unknown SKU', async () => {
    await request(app.getHttpServer()).get('/api/products/P-99999').expect(404);
  });

  it('reports catalogue freshness from the last successful import only', async () => {
    const lastSuccess = await prisma.importRun.findFirstOrThrow({ where: { outcome: 'SUCCEEDED' } });
    await prisma.importRun.create({
      data: {
        sourceFile: 'broken.csv',
        startedAt: new Date(Date.now() + 60_000),
        finishedAt: new Date(Date.now() + 60_000),
        outcome: 'FAILED',
        rowsRead: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        delisted: 0,
        relisted: 0,
        rejected: 0,
        issues: [],
      },
    });

    const response = await request(app.getHttpServer()).get('/api/catalog/status').expect(200);

    // 200 imported products minus P-10002, delisted in beforeAll.
    expect(response.body.listedProducts).toBe(199);
    expect(response.body.lastImportAt).toBe(lastSuccess.finishedAt.toISOString());
  });
});

describe('CatalogFacade (integration)', () => {
  let app: INestApplication;
  let facade: CatalogFacade;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, CatalogModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    const prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    await app.get(CatalogImportService).importContent(PIM_EXPORT, { sourceFile: 'test.csv' });
    await prisma.product.update({ where: { sku: 'P-10002' }, data: { listed: false } });
    facade = app.get(CatalogFacade);
  });

  afterAll(async () => {
    await app.close();
  });

  it('pages through every listed product exactly once, in SKU order', async () => {
    const batches: string[][] = [];
    for await (const batch of facade.listedProducts(50)) {
      batches.push(batch.map((product) => product.sku));
    }
    const skus = batches.flat();

    expect(batches.map((batch) => batch.length)).toEqual([50, 50, 50, 49]);
    expect(new Set(skus).size).toBe(199);
    expect(skus).toEqual([...skus].sort());
    expect(skus).not.toContain('P-10002');
  });

  it('finds products by SKU, including delisted ones, and omits unknown SKUs', async () => {
    expect(await facade.findBySkus([])).toEqual([]);

    const found = await facade.findBySkus(['P-10001', 'P-10002', 'P-99999']);

    expect(found.map((product) => [product.sku, product.listed]).sort()).toEqual([
      ['P-10001', true],
      ['P-10002', false],
    ]);
  });
});
