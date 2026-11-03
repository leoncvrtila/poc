import { Test, type TestingModule } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CatalogImportService, CatalogModule } from '../src/modules/catalog';
import { IMPORT_LOCK_KEY } from '../src/modules/catalog/import/catalog-import.service';
import { OutboxPublisher } from '../src/shared/outbox';
import { AppConfigModule } from '../src/shared/config/app-config.module';
import { PrismaModule } from '../src/shared/prisma/prisma.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetDatabase } from './support/database';

const PIM_EXPORT = readFileSync(resolve(__dirname, '../../data/products.csv'), 'utf8');

const CSV_HEADER = PIM_EXPORT.split('\n')[0];

function syntheticCsv(count: number, description: (index: number) => string): string {
  const lines = Array.from({ length: count }, (_, i) => {
    const sku = `S-${String(i).padStart(5, '0')}`;
    return `${sku},Name ${i},Chem ${i},Surfactant,Home Care,EMEA,Halal|Vegan,Active,2010,${description(i)}`;
  });
  return [CSV_HEADER, ...lines].join('\n');
}

function withoutSkus(csv: string, skus: string[]): string {
  return csv
    .split('\n')
    .filter((line) => !skus.some((sku) => line.startsWith(`${sku},`)))
    .join('\n');
}

describe('Catalog import (integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let importer: CatalogImportService;

  const run = (csv: string, force = false) => importer.importContent(csv, { sourceFile: 'test.csv', force });
  const changedSkus = async (): Promise<string[]> => {
    const events = await prisma.outboxEvent.findMany({ orderBy: { id: 'asc' } });
    return events.flatMap((event) => (event.payload as { skus: string[] }).skus);
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppConfigModule, PrismaModule, CatalogModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    importer = moduleRef.get(CatalogImportService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('loads the real PIM export into an empty database', async () => {
    const result = await run(PIM_EXPORT);

    expect(result).toMatchObject({ outcome: 'SUCCEEDED', rowsRead: 202, created: 200, rejected: 0, delisted: 0 });
    expect(result.issues.filter((issue) => issue.severity === 'warning')).toHaveLength(5);
    expect(await prisma.product.count()).toBe(200);

    const byStatus = await prisma.product.groupBy({ by: ['status'], _count: { _all: true } });
    expect(Object.fromEntries(byStatus.map((group) => [group.status, group._count._all]))).toEqual({
      ACTIVE: 140,
      PHASE_OUT: 30,
      DISCONTINUED: 30,
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10151' } })).status).toBe('DISCONTINUED');
    expect((await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10016' } })).region).toBe('EMEA');
    expect((await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10119' } })).name).toBeNull();
    expect((await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10067' } })).certifications).toEqual([
      'Halal',
      'Vegan',
    ]);
    expect(await changedSkus()).toHaveLength(200);
  });

  it('is idempotent: a second run changes nothing and emits no events', async () => {
    await run(PIM_EXPORT);
    await prisma.outboxEvent.deleteMany();

    const second = await run(PIM_EXPORT);

    expect(second).toMatchObject({ outcome: 'SUCCEEDED', created: 0, updated: 0, unchanged: 200, delisted: 0 });
    expect(await prisma.product.count()).toBe(200);
    expect(await prisma.outboxEvent.count()).toBe(0);
    expect(await prisma.importRun.count()).toBe(2);
  });

  it('never touches reviews', async () => {
    await run(PIM_EXPORT);
    await prisma.review.create({
      data: { productSku: 'P-10001', authorName: 'Ana', rating: 5, comment: 'Great product overall.' },
    });

    await run(PIM_EXPORT);
    await run(withoutSkus(PIM_EXPORT, ['P-10001']));

    expect(await prisma.review.count({ where: { productSku: 'P-10001' } })).toBe(1);
  });

  it('delists products missing from the export and relists them when they return', async () => {
    await run(PIM_EXPORT);
    await prisma.outboxEvent.deleteMany();

    const delisting = await run(withoutSkus(PIM_EXPORT, ['P-10001']));
    expect(delisting).toMatchObject({ delisted: 1, unchanged: 199 });
    expect((await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10001' } })).listed).toBe(false);
    expect(await changedSkus()).toEqual(['P-10001']);

    await prisma.outboxEvent.deleteMany();
    const relisting = await run(PIM_EXPORT);
    expect(relisting).toMatchObject({ relisted: 1, unchanged: 199 });
    expect((await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10001' } })).listed).toBe(true);
    expect(await changedSkus()).toEqual(['P-10001']);
  });

  it('updates only rows whose content changed', async () => {
    await run(PIM_EXPORT);
    await prisma.outboxEvent.deleteMany();

    const changed = PIM_EXPORT.replace(
      'Emulsifier based on Polysorbate 80 for agriculture applications.',
      'Updated description.',
    );
    const result = await run(changed);

    expect(result).toMatchObject({ updated: 1, unchanged: 199 });
    expect((await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10002' } })).description).toContain(
      'Updated description.',
    );
    expect(await changedSkus()).toEqual(['P-10002']);
  });

  it('refuses a suspiciously small export unless forced', async () => {
    await run(PIM_EXPORT);
    const truncated = PIM_EXPORT.split('\n').slice(0, 6).join('\n');

    const aborted = await run(truncated);
    expect(aborted.outcome).toBe('ABORTED');
    expect(aborted.message).toContain('--force');
    expect(await prisma.product.count({ where: { listed: true } })).toBe(200);
    expect(await prisma.importRun.count({ where: { outcome: 'ABORTED' } })).toBe(1);

    const forced = await run(truncated, true);
    expect(forced).toMatchObject({ outcome: 'SUCCEEDED', delisted: 195 });
  });

  it('aborts a file with missing columns without touching the catalogue', async () => {
    const result = await run('sku,name\nP-1,Alpha\n');

    expect(result).toMatchObject({
      outcome: 'ABORTED',
      message:
        'Missing required columns: chemical_name, function, application_area, region, certifications, status, launch_year, description',
    });
    expect(await prisma.product.count()).toBe(0);
  });

  it('leaves a product untouched when its row is rejected', async () => {
    await run(PIM_EXPORT);
    await prisma.outboxEvent.deleteMany();
    const before = await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10001' } });
    const lines = PIM_EXPORT.split('\n');
    const index = lines.findIndex((line) => line.startsWith('P-10001,'));
    lines[index] = lines[index].replace(',Active,2012,', ',Retired,2012,');
    expect(lines[index]).not.toBe(PIM_EXPORT.split('\n')[index]);

    const result = await run(lines.join('\n'));

    expect(result).toMatchObject({ outcome: 'SUCCEEDED', rejected: 1, delisted: 0 });
    expect(result.issues).toContainEqual(expect.objectContaining({ sku: 'P-10001', severity: 'warning' }));
    expect(await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10001' } })).toEqual(before);
    expect(await changedSkus()).not.toContain('P-10001');
  });

  it('updates 1,205 products in batches and publishes events for all of them', async () => {
    await run(syntheticCsv(1205, (i) => `Original ${i}`));
    const sampleBefore = await prisma.product.findUniqueOrThrow({ where: { sku: 'S-00600' } });
    await prisma.outboxEvent.deleteMany();

    // Forced: the subject is batching, not the mass-change guard.
    const result = await run(
      syntheticCsv(1205, (i) => `Changed ${i}`),
      true,
    );

    expect(result).toMatchObject({ outcome: 'SUCCEEDED', created: 0, updated: 1205, unchanged: 0 });
    const sampleAfter = await prisma.product.findUniqueOrThrow({ where: { sku: 'S-00600' } });
    expect(sampleAfter.description).toBe('Changed 600');
    expect(sampleAfter.certifications).toEqual(['Halal', 'Vegan']);
    expect(sampleAfter.status).toBe('ACTIVE');
    expect(sampleAfter.contentHash).not.toBe(sampleBefore.contentHash);
    expect(sampleAfter.updatedAt.getTime()).toBeGreaterThan(sampleBefore.updatedAt.getTime());
    expect(await prisma.product.count({ where: { description: { startsWith: 'Changed' } } })).toBe(1205);

    const events = await prisma.outboxEvent.findMany({ orderBy: { id: 'asc' } });
    const batches = events.map((event) => (event.payload as { skus: string[] }).skus);
    expect(batches.map((skus) => skus.length)).toEqual([500, 500, 205]);
    expect(new Set(batches.flat()).size).toBe(1205);
  });

  it('aborts when another import holds the lock', async () => {
    let result: Awaited<ReturnType<typeof run>> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${IMPORT_LOCK_KEY}::bigint)`;
      result = await run(PIM_EXPORT);
    });

    expect(result).toMatchObject({ outcome: 'ABORTED', message: 'Another import is already running; try again later' });
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.importRun.count({ where: { outcome: 'ABORTED' } })).toBe(1);
  });

  it('stores at most 1000 issues but returns all of them', async () => {
    const blankSku = Array.from({ length: 1100 }, (_, i) => `,Name ${i},Chem,Surfactant,Home Care,EMEA,,Active,2010,d`);
    const csv = [CSV_HEADER, 'S-1,One,Chem,Surfactant,Home Care,EMEA,,Active,2010,d', ...blankSku].join('\n');

    const result = await run(csv);

    expect(result.outcome).toBe('SUCCEEDED');
    expect(result.issues).toHaveLength(1101);
    const [stored] = await prisma.importRun.findMany();
    const issues = stored.issues as unknown as { line: number | null; message: string; severity: string }[];
    expect(issues).toHaveLength(1001);
    expect(issues[1000]).toEqual({
      line: null,
      sku: null,
      field: null,
      severity: 'warning',
      message: '101 more issues not stored',
    });
  });

  it('reports the real rejected count when an import is aborted', async () => {
    await run(PIM_EXPORT);
    const small = [...PIM_EXPORT.split('\n').slice(0, 6), 'P-BAD,,,,,,,Bogus,,'].join('\n');

    const result = await run(small);

    expect(result).toMatchObject({ outcome: 'ABORTED', rowsRead: 6, rejected: 1 });
  });

  it('delists nothing when a row without a readable SKU may hide a live product', async () => {
    await run(PIM_EXPORT);
    const lines = PIM_EXPORT.split('\n');
    const index = lines.findIndex((line) => line.startsWith('P-10001,'));
    lines[index] = lines[index].replace('P-10001', '');

    const result = await run(lines.join('\n'));

    expect(result).toMatchObject({ outcome: 'SUCCEEDED', delisted: 0, rejected: 1 });
    expect(result.issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: 'Delisting skipped: 1 row(s) could not be identified' }),
    );
    expect((await prisma.product.findUniqueOrThrow({ where: { sku: 'P-10001' } })).listed).toBe(true);
  });
});

describe('Catalog import rollback (integration)', () => {
  it('rolls back the catalogue changes when publishing events fails', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppConfigModule, PrismaModule, CatalogModule] })
      .overrideProvider(OutboxPublisher)
      .useValue({ publish: () => Promise.reject(new Error('boom')) })
      .compile();
    await moduleRef.init();
    try {
      const prisma = moduleRef.get(PrismaService);
      await resetDatabase(prisma);

      await expect(
        moduleRef.get(CatalogImportService).importContent(PIM_EXPORT, { sourceFile: 'test.csv' }),
      ).rejects.toThrow('boom');

      expect(await prisma.product.count()).toBe(0);
      expect(await prisma.outboxEvent.count()).toBe(0);
      const runs = await prisma.importRun.findMany();
      expect(runs).toHaveLength(1);
      expect(runs[0].outcome).toBe('FAILED');
    } finally {
      await moduleRef.close();
    }
  });
});
