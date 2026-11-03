import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { REINDEX_LOCK_KEY, runCommand } from '../src/cli/run-command';
import { ReviewsService } from '../src/modules/reviews';
import { MeiliClient } from '../src/modules/search/infrastructure/meili/meili-client';
import { APP_CONFIG, type AppConfig } from '../src/shared/config/app-config';
import { MAX_OUTBOX_ATTEMPTS, OutboxRelay } from '../src/shared/outbox';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetDatabase } from './support/database';

const PRODUCTS_CSV = resolve(__dirname, '../../data/products.csv');

describe('CLI commands (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tmpDir: string;
  const out = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const logged = (): string => out.log.mock.calls.map((call) => String(call[0])).join('\n');
  const seed = (): Promise<number> => runCommand(app, 'seed', ['--file', PRODUCTS_CSV], out);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    tmpDir = mkdtempSync(join(tmpdir(), 'pf-cli-'));
  });

  afterAll(async () => {
    try {
      await app.get(MeiliClient).runTask('DELETE', `/indexes/${process.env.MEILI_INDEX}`);
    } catch (error) {
      if ((error as { code?: string }).code !== 'index_not_found') {
        throw error;
      }
    }
    await app.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await resetDatabase(prisma);
  });

  it('seeds the catalogue and exits with 0', async () => {
    const code = await seed();

    expect(code).toBe(0);
    expect(await prisma.product.count()).toBe(200);
  });

  it('exits with 1 and keeps the catalogue when the export looks truncated', async () => {
    expect(await seed()).toBe(0);
    const truncated = join(tmpDir, 'pf-truncated.csv');
    writeFileSync(truncated, readFileSync(PRODUCTS_CSV, 'utf8').split(/\r?\n/).slice(0, 6).join('\n'));

    const code = await runCommand(app, 'import', ['--file', truncated], out);

    expect(code).toBe(1);
    expect(await prisma.product.count({ where: { listed: true } })).toBe(200);
  });

  it('prints the usage and exits with 2 for an unknown command', async () => {
    const code = await runCommand(app, 'bogus', [], out);

    expect(code).toBe(2);
    expect(out.error).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('reindexes the listed products', async () => {
    expect(await seed()).toBe(0);
    out.log.mockClear();

    const code = await runCommand(app, 'reindex', [], out);

    expect(code).toBe(0);
    expect(logged()).toContain('200 products');
  });

  it('refuses to reindex while another reindex holds the lock', async () => {
    expect(await seed()).toBe(0);
    let release!: () => void;
    const held = new Promise<void>((resolveHeld) => (release = resolveHeld));
    let locked!: () => void;
    const lockAcquired = new Promise<void>((resolveLocked) => (locked = resolveLocked));
    const holder = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REINDEX_LOCK_KEY}::bigint)`;
      locked();
      await held;
    });
    await lockAcquired;

    try {
      const code = await runCommand(app, 'reindex', [], out);

      expect(code).toBe(1);
      expect(out.error).toHaveBeenCalledWith(expect.stringContaining('already running'));
    } finally {
      release();
      await holder;
    }
  });

  describe('reviews:remove', () => {
    const meiliDocument = (sku: string) =>
      app
        .get(MeiliClient)
        .request<{ reviewCount: number; ratingAverage: number | null }>(
          'GET',
          `/indexes/${process.env.MEILI_INDEX}/documents/${sku}`,
        );

    it('removes the review and refreshes the product rating in the search index', async () => {
      expect(await seed()).toBe(0);
      const reviews = app.get(ReviewsService);
      const keep = await reviews.create('P-10001', { authorName: 'Ana', rating: 5, comment: 'Kept review text.' });
      const drop = await reviews.create('P-10001', { authorName: 'Bob', rating: 1, comment: 'Dropped review text.' });
      await app.get(OutboxRelay).drain();
      expect(await meiliDocument('P-10001')).toMatchObject({ reviewCount: 2, ratingAverage: 3 });

      const code = await runCommand(app, 'reviews:remove', [drop.id], out);

      expect(code).toBe(0);
      expect(await prisma.review.findMany({ select: { id: true } })).toEqual([{ id: keep.id }]);
      expect(await meiliDocument('P-10001')).toMatchObject({ reviewCount: 1, ratingAverage: 5 });
      expect(logged()).toContain(`Review ${drop.id} removed from P-10001`);
    });

    it('exits with 1 for an unknown id', async () => {
      const code = await runCommand(app, 'reviews:remove', ['3f1b1c52-5a56-4c5e-8e0a-1d6f2f2f2f2f'], out);

      expect(code).toBe(1);
      expect(out.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('exits with 1 for an id that is not a UUID', async () => {
      expect(await runCommand(app, 'reviews:remove', ['abc'], out)).toBe(1);
    });

    it('exits with 2 and prints the usage without an id', async () => {
      expect(await runCommand(app, 'reviews:remove', [], out)).toBe(2);
      expect(out.error).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });

  describe('seed with a synthetic catalogue', () => {
    const seedWithSize = async (size: number): Promise<number> => {
      const config = app.get<AppConfig>(APP_CONFIG);
      const original = config.seedCatalogSize;
      config.seedCatalogSize = size;
      try {
        return await seed();
      } finally {
        config.seedCatalogSize = original;
      }
    };

    // Later tests count indexed documents: drop the synthetic ones from the search index.
    afterEach(async () => {
      await resetDatabase(prisma);
      expect(await runCommand(app, 'reindex', [], out)).toBe(0);
    });

    it('adds synthetic products up to the configured catalogue size', async () => {
      expect(await seedWithSize(0)).toBe(0);
      const exportProducts = await prisma.product.count();
      await resetDatabase(prisma);
      out.log.mockClear();

      const code = await seedWithSize(250);

      expect(code).toBe(0);
      expect(await prisma.product.count()).toBe(exportProducts + 48);
      expect(logged()).toContain('48 synthetic');
      const synthetic = await prisma.product.findUniqueOrThrow({ where: { sku: 'P-200001' } });
      expect(synthetic.description.startsWith('Synthetic demo product.')).toBe(true);
    });

    it('is idempotent when seeded again', async () => {
      expect(await seedWithSize(250)).toBe(0);
      const total = await prisma.product.count();
      out.log.mockClear();

      expect(await seedWithSize(250)).toBe(0);

      expect(logged()).toContain('created 0');
      expect(logged()).toContain(`unchanged ${total}`);
      expect(await prisma.product.count()).toBe(total);
    });

    it('seeds only the export when the size is 0', async () => {
      expect(await seedWithSize(0)).toBe(0);

      expect(await prisma.product.count()).toBe(200);
      expect(await prisma.product.count({ where: { sku: { startsWith: 'P-2' } } })).toBe(0);
      expect(logged()).not.toContain('synthetic');
    });
  });

  describe('import safety', () => {
    /** The real export with the first `count` descriptions changed. */
    const changedExport = (count: number, name: string): string => {
      const file = join(tmpDir, name);
      const lines = readFileSync(PRODUCTS_CSV, 'utf8').split(/\r?\n/);
      writeFileSync(file, lines.map((line, i) => (i >= 1 && i <= count ? `${line} Updated.` : line)).join('\n'));
      return file;
    };
    const counts = async () => ({
      products: await prisma.product.count(),
      events: await prisma.outboxEvent.count(),
      runs: await prisma.importRun.count(),
    });

    it('reports a dry run without writing products, events or an import run', async () => {
      expect(await seed()).toBe(0);
      const before = await counts();
      out.log.mockClear();

      const code = await runCommand(app, 'import', ['--file', changedExport(5, 'pf-dry.csv'), '--dry-run'], out);

      expect(code).toBe(0);
      expect(logged()).toContain('DRY RUN — nothing was written');
      expect(logged()).toContain('updated 5');
      expect(await counts()).toEqual(before);
      expect(await prisma.product.count({ where: { description: { endsWith: ' Updated.' } } })).toBe(0);
    });

    it('exits with 1 and records nothing when a dry run trips the guard', async () => {
      expect(await seed()).toBe(0);
      const before = await counts();

      const code = await runCommand(app, 'import', ['--file', changedExport(70, 'pf-dry-big.csv'), '--dry-run'], out);

      expect(code).toBe(1);
      expect(await counts()).toEqual(before);
    });

    it('aborts an import that changes more than 30 percent unless forced', async () => {
      expect(await seed()).toBe(0);
      const file = changedExport(70, 'pf-big.csv');

      const code = await runCommand(app, 'import', ['--file', file], out);

      expect(code).toBe(1);
      expect(logged()).toContain('--force');
      const aborted = await prisma.importRun.findFirst({ orderBy: { startedAt: 'desc' } });
      expect(aborted?.outcome).toBe('ABORTED');
      expect(await prisma.product.count({ where: { description: { endsWith: ' Updated.' } } })).toBe(0);

      expect(await runCommand(app, 'import', ['--file', file, '--force'], out)).toBe(0);
      expect(await prisma.product.count({ where: { description: { endsWith: ' Updated.' } } })).toBe(69); // P-10013 appears twice in the export
    });
  });

  describe('search:verify', () => {
    it('exits with 0 when the index matches the catalogue', async () => {
      expect(await seed()).toBe(0);
      out.log.mockClear();

      const code = await runCommand(app, 'search:verify', [], out);

      expect(code).toBe(0);
      expect(logged()).toContain('in sync');
    });

    it('exits with 1 and points to search:reindex when a document is missing', async () => {
      expect(await seed()).toBe(0);
      await app.get(MeiliClient).runTask('DELETE', `/indexes/${process.env.MEILI_INDEX}/documents/P-10001`);

      const code = await runCommand(app, 'search:verify', [], out);

      expect(code).toBe(1);
      expect(out.error).toHaveBeenCalledWith(expect.stringContaining('search:reindex'));
      expect(logged()).toContain('indexed documents 199');
    });

    it('exits with 1 and explains when Meilisearch is unreachable', async () => {
      expect(await seed()).toBe(0);
      const client = app.get(MeiliClient);
      const unreachable = new MeiliClient('http://127.0.0.1:1', '');
      const spy = jest.spyOn(client, 'request').mockImplementation((...args) => unreachable.request(...args));

      try {
        const code = await runCommand(app, 'search:verify', [], out);

        expect(code).toBe(1);
        expect(out.error).toHaveBeenCalledWith(
          expect.stringMatching(/^Search index could not be checked: .*unreachable/),
        );
      } finally {
        spy.mockRestore();
      }
    });

    it('exits with 1 and prints the dead-letter count', async () => {
      expect(await seed()).toBe(0);
      await prisma.outboxEvent.create({
        data: { type: 'catalog.products-changed', payload: { skus: [] }, attempts: MAX_OUTBOX_ATTEMPTS },
      });

      const code = await runCommand(app, 'search:verify', [], out);

      expect(code).toBe(1);
      expect(logged()).toContain('Dead-letter events 1');
    });

    it('exits with 1 and counts events that are stuck', async () => {
      expect(await seed()).toBe(0);
      await prisma.outboxEvent.create({
        data: {
          type: 'catalog.products-changed',
          payload: { skus: [] },
          createdAt: new Date(Date.now() - 60 * 60_000),
        },
      });

      expect(await runCommand(app, 'search:verify', [], out)).toBe(1);
      expect(logged()).toContain('stuck events 1');
    });
  });
});
