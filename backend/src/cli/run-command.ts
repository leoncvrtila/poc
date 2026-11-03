import type { INestApplicationContext } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CatalogImportService, type ImportResult } from '../modules/catalog';
import { DemoReviewsSeeder, ReviewsService } from '../modules/reviews';
import { SearchIndexer } from '../modules/search';
import { APP_CONFIG, type AppConfig } from '../shared/config/app-config';
import { OutboxMonitor, OutboxRelay } from '../shared/outbox';
import { PrismaService } from '../shared/prisma/prisma.service';
import { errorMessage } from '../shared/util/error-message';
import { exportRowCount, syntheticCatalogRows } from './synthetic-catalog';

export type CliOutput = Pick<Console, 'log' | 'warn' | 'error'>;

const USAGE =
  'Usage: node dist/cli.js <seed | import [--file <path>] [--force] [--dry-run] | demo-reviews | reviews:remove <id> | reindex | search:verify>';

/** Postgres advisory lock key: only one reindex at a time. */
export const REINDEX_LOCK_KEY = 4_242_002;
const REINDEX_TIMEOUT_MS = 30 * 60_000;
/** Above this many new products the first Meilisearch indexing is slow enough to warrant a notice. */
const LARGE_SEED = 10_000;

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printImport(result: ImportResult, out: CliOutput): void {
  out.log(`Import ${result.outcome}${result.message ? `: ${result.message}` : ''}`);
  out.log(
    `  rows read ${result.rowsRead} · created ${result.created} · updated ${result.updated} · unchanged ${result.unchanged}` +
      ` · delisted ${result.delisted} · relisted ${result.relisted} · rejected ${result.rejected}`,
  );
  for (const issue of result.issues) {
    out.log(
      `  [${issue.severity}] line ${issue.line ?? '-'} ${issue.sku ?? ''} ${issue.field ?? ''}: ${issue.message}`,
    );
  }
}

/** Runs one CLI command and returns the process exit code (0 ok, 1 failed/aborted, 2 usage). */
export async function runCommand(
  app: INestApplicationContext,
  command: string | undefined,
  args: string[],
  out: CliOutput = console,
): Promise<number> {
  const drainOutbox = async (): Promise<void> => {
    try {
      await app.get(OutboxRelay).drain();
    } catch (error) {
      out.warn(`Search index not updated yet (the API relay will retry): ${errorMessage(error)}`);
    }
  };

  switch (command) {
    case 'seed':
    case 'import': {
      const config = app.get<AppConfig>(APP_CONFIG);
      const file = resolve(option(args, '--file') ?? config.pimExportPath);
      const exportCsv = await readFile(file, 'utf8');
      // Only `seed` tops the catalogue up with synthetic products; `import` loads the file as is.
      const synthetic = command === 'seed' ? Math.max(0, config.seedCatalogSize - exportRowCount(exportCsv)) : 0;
      const content =
        synthetic > 0 ? `${exportCsv.replace(/\n?$/, '\n')}${syntheticCatalogRows(exportCsv, synthetic)}` : exportCsv;
      if (synthetic > 0) {
        out.log(`Seeding ${synthetic} synthetic products on top of the export`);
      }
      const result = await app.get(CatalogImportService).importContent(content, {
        sourceFile: synthetic > 0 ? `${file} + ${synthetic} synthetic` : file,
        force: args.includes('--force'),
        dryRun: args.includes('--dry-run'),
      });
      if (result.dryRun) {
        out.log('DRY RUN — nothing was written');
      }
      printImport(result, out);
      if (!result.dryRun) {
        if (result.created > LARGE_SEED) {
          out.log(`Indexing ${result.created} products in Meilisearch; the first start takes a few minutes…`);
        }
        await drainOutbox();
      }
      return result.outcome === 'SUCCEEDED' ? 0 : 1;
    }
    case 'demo-reviews': {
      const inserted = await app.get(DemoReviewsSeeder).seed();
      out.log(`Demo reviews inserted: ${inserted}`);
      await drainOutbox();
      return 0;
    }
    case 'reviews:remove': {
      const id = args[0];
      if (!id) {
        out.error(USAGE);
        return 2;
      }
      const sku = await app.get(ReviewsService).remove(id);
      if (!sku) {
        out.error(`Review ${id} not found`);
        return 1;
      }
      out.log(`Review ${id} removed from ${sku}`);
      await drainOutbox();
      return 0;
    }
    case 'reindex': {
      // Transaction-scoped advisory lock: pinned to one connection and released on commit/rollback/crash.
      const outcome = await app.get(PrismaService).$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
              SELECT pg_try_advisory_xact_lock(${REINDEX_LOCK_KEY}::bigint) AS locked`;
          return locked ? await app.get(SearchIndexer).rebuildAll() : undefined;
        },
        { timeout: REINDEX_TIMEOUT_MS },
      );
      if (outcome === undefined) {
        out.error('Another reindex is already running; aborting.');
        return 1;
      }
      out.log(`Search index rebuilt with ${outcome} products`);
      return 0;
    }
    case 'search:verify': {
      let verified: Awaited<ReturnType<SearchIndexer['verify']>>;
      try {
        verified = await app.get(SearchIndexer).verify();
      } catch (error) {
        out.error(`Search index could not be checked: ${errorMessage(error)}`);
        return 1;
      }
      const { listedProducts, indexedDocuments } = verified;
      const { deadLetters, stuck } = await app.get(OutboxMonitor).stats();
      out.log(`Listed products ${listedProducts} · indexed documents ${indexedDocuments}`);
      out.log(`Dead-letter events ${deadLetters} · stuck events ${stuck}`);
      if (listedProducts !== indexedDocuments || deadLetters > 0 || stuck > 0) {
        out.error('Search index is out of sync: run `npm run search:reindex` and check dead-letter events.');
        return 1;
      }
      out.log('Search index is in sync');
      return 0;
    }
    default:
      out.error(USAGE);
      return 2;
  }
}
