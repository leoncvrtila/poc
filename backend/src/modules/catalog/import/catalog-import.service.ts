import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import type { Prisma } from '../../../generated/prisma/client';
import { OutboxPublisher } from '../../../shared/outbox';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { chunks } from '../../../shared/util/chunks';
import { errorMessage } from '../../../shared/util/error-message';
import { CATALOG_PRODUCTS_CHANGED, type ProductsChangedPayload } from '../catalog.events';
import { contentHash } from './content-hash';
import { readCsvRows } from './csv-source';
import { dedupeBySku } from './dedupe';
import { ImportAbortedError } from './import-errors';
import { DEFAULT_MAX_CHANGE_RATIO, DEFAULT_MIN_RATIO, type ImportPlan, planImport } from './import-planner';
import type { ImportIssue, NormalizedRow } from './import.types';
import { normalizeRow } from './normalize-row';

export type ImportOutcome = 'SUCCEEDED' | 'ABORTED' | 'FAILED';

export interface ImportResult {
  outcome: ImportOutcome;
  message: string | null;
  rowsRead: number;
  created: number;
  updated: number;
  unchanged: number;
  delisted: number;
  relisted: number;
  rejected: number;
  issues: ImportIssue[];
  /** True when the plan was computed but nothing was written. */
  dryRun: boolean;
}

export interface ImportOptions {
  sourceFile: string;
  force?: boolean;
  /** Plans and reports the import, then returns without writing anything (not even an import run); the transaction commits empty. */
  dryRun?: boolean;
  now?: Date;
}

/** Advisory lock key that serialises imports. */
export const IMPORT_LOCK_KEY = 4_242_001;
const WRITE_CHUNK = 1000;
const EVENT_CHUNK = 500;
const MAX_STORED_ISSUES = 1000;

@Injectable()
export class CatalogImportService {
  private readonly logger = new Logger(CatalogImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxPublisher,
  ) {}

  async importFile(filePath: string, options: { force?: boolean; dryRun?: boolean } = {}): Promise<ImportResult> {
    const content = await readFile(filePath, 'utf8');
    return this.importContent(content, { sourceFile: filePath, ...options });
  }

  async importContent(content: string, options: ImportOptions): Promise<ImportResult> {
    const startedAt = options.now ?? new Date();
    const issues: ImportIssue[] = [];
    let rowsRead = 0;
    let rejected = 0;

    try {
      const source = readCsvRows(content);
      rowsRead = source.rows.length + source.issues.length;
      issues.push(...source.issues);

      const normalized: NormalizedRow[] = [];
      for (const row of source.rows) {
        const result = normalizeRow(row, startedAt.getUTCFullYear());
        issues.push(...result.issues);
        if (result.product) {
          normalized.push({ line: row.line, product: result.product, hash: contentHash(result.product) });
        }
      }
      const deduped = dedupeBySku(normalized);
      issues.push(...deduped.issues);
      rejected = rowsRead - normalized.length;

      const untouchedSkus = new Set<string>();
      for (const issue of issues) {
        if (issue.severity === 'error' && issue.sku) untouchedSkus.add(issue.sku);
      }
      for (const sku of [...untouchedSkus].sort()) {
        issues.push({
          line: null,
          sku,
          field: null,
          severity: 'warning',
          message: 'Rejected row(s) for this SKU; the product was left unchanged',
        });
      }

      // Rows we cannot attribute to a SKU may hide a live product, so this run must not delist anything.
      const unidentified = issues.filter((issue) => issue.severity === 'error' && issue.sku === null).length;
      if (unidentified > 0) {
        issues.push({
          line: null,
          sku: null,
          field: null,
          severity: 'warning',
          message: `Delisting skipped: ${unidentified} row(s) could not be identified`,
        });
      }

      return await this.prisma.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(${IMPORT_LOCK_KEY}::bigint) AS locked`;
          if (!locked) {
            throw new ImportAbortedError('Another import is already running; try again later');
          }
          const existing = await tx.product.findMany({ select: { sku: true, contentHash: true, listed: true } });
          const plan = planImport(deduped.rows, existing, {
            force: options.force ?? false,
            minRatio: DEFAULT_MIN_RATIO,
            maxChangeRatio: DEFAULT_MAX_CHANGE_RATIO,
            untouchedSkus,
            skipDelists: unidentified > 0,
          });
          if (options.dryRun) {
            return summarize('SUCCEEDED', null, rowsRead, rejected, plan, issues, true);
          }
          await this.apply(tx, plan);
          const result = summarize('SUCCEEDED', null, rowsRead, rejected, plan, issues);
          await tx.importRun.create({ data: runData(options.sourceFile, startedAt, result) });
          return result;
        },
        { timeout: 120_000, maxWait: 10_000 },
      );
    } catch (error) {
      const outcome: ImportOutcome = error instanceof ImportAbortedError ? 'ABORTED' : 'FAILED';
      const result = summarize(outcome, errorMessage(error), rowsRead, rejected, null, issues, options.dryRun ?? false);
      if (!options.dryRun) {
        try {
          await this.prisma.importRun.create({ data: runData(options.sourceFile, startedAt, result) });
        } catch (recordError) {
          // Never let a failed audit write hide the original outcome.
          this.logger.error(`Could not record the ${outcome} import run: ${errorMessage(recordError)}`);
        }
      }
      if (outcome === 'ABORTED') {
        this.logger.warn(`Import aborted: ${result.message}`);
        return result;
      }
      throw error;
    }
  }

  private async apply(tx: Prisma.TransactionClient, plan: ImportPlan): Promise<void> {
    for (const batch of chunks(plan.creates, WRITE_CHUNK)) {
      await tx.product.createMany({
        data: batch.map((row) => ({ ...row.product, contentHash: row.hash, listed: true })),
      });
    }
    for (const batch of chunks([...plan.updates, ...plan.relists], WRITE_CHUNK)) {
      await this.updateBatch(tx, batch);
    }
    for (const batch of chunks(plan.delists, WRITE_CHUNK)) {
      await tx.product.updateMany({ where: { sku: { in: batch } }, data: { listed: false } });
    }

    const changedSkus = [...plan.creates, ...plan.updates, ...plan.relists]
      .map((row) => row.product.sku)
      .concat(plan.delists);
    await this.outbox.publish(
      tx,
      chunks(changedSkus, EVENT_CHUNK).map((skus) => ({
        type: CATALOG_PRODUCTS_CHANGED,
        payload: { skus } satisfies ProductsChangedPayload,
      })),
    );
  }

  /** One UPDATE per chunk instead of one per row. Raw SQL bypasses `@updatedAt`, so it is set explicitly. */
  private async updateBatch(tx: Prisma.TransactionClient, rows: NormalizedRow[]): Promise<void> {
    const json = JSON.stringify(
      rows.map(({ product, hash }) => ({
        sku: product.sku,
        name: product.name,
        chemical_name: product.chemicalName,
        function: product.function,
        application_area: product.applicationArea,
        region: product.region,
        certifications: product.certifications,
        status: product.status,
        launch_year: product.launchYear,
        description: product.description,
        content_hash: hash,
      })),
    );
    await tx.$executeRaw`
      UPDATE product AS p
         SET name = v.name,
             chemical_name = v.chemical_name,
             "function" = v."function",
             application_area = v.application_area,
             region = v.region,
             certifications = v.certifications,
             status = v.status::"ProductStatus",
             launch_year = v.launch_year,
             description = v.description,
             content_hash = v.content_hash,
             listed = true,
             updated_at = now()
        FROM jsonb_to_recordset(${json}::jsonb) AS v(
             sku text, name text, chemical_name text, "function" text, application_area text, region text,
             certifications text[], status text, launch_year integer, description text, content_hash text)
       WHERE p.sku = v.sku`;
  }
}

function summarize(
  outcome: ImportOutcome,
  message: string | null,
  rowsRead: number,
  rejected: number,
  plan: ImportPlan | null,
  issues: ImportIssue[],
  dryRun = false,
): ImportResult {
  return {
    outcome,
    message,
    rowsRead,
    created: plan?.creates.length ?? 0,
    updated: plan?.updates.length ?? 0,
    unchanged: plan?.unchanged ?? 0,
    delisted: plan?.delists.length ?? 0,
    relisted: plan?.relists.length ?? 0,
    rejected,
    issues,
    dryRun,
  };
}

function runData(sourceFile: string, startedAt: Date, result: ImportResult): Prisma.ImportRunCreateInput {
  return {
    sourceFile,
    startedAt,
    finishedAt: new Date(),
    outcome: result.outcome,
    message: result.message,
    rowsRead: result.rowsRead,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    delisted: result.delisted,
    relisted: result.relisted,
    rejected: result.rejected,
    issues: storedIssues(result.issues) as unknown as Prisma.InputJsonValue,
  };
}

/** Keeps the audit row small: the first issues plus a marker for the rest. */
function storedIssues(issues: ImportIssue[]): ImportIssue[] {
  if (issues.length <= MAX_STORED_ISSUES) {
    return issues;
  }
  return [
    ...issues.slice(0, MAX_STORED_ISSUES),
    {
      line: null,
      sku: null,
      field: null,
      severity: 'warning',
      message: `${issues.length - MAX_STORED_ISSUES} more issues not stored`,
    },
  ];
}
