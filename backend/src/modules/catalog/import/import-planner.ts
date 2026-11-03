import { ImportAbortedError } from './import-errors';
import type { ExistingProductState, NormalizedRow } from './import.types';

export const DEFAULT_MIN_RATIO = 0.5;
export const DEFAULT_MAX_CHANGE_RATIO = 0.3;

export interface ImportPlan {
  creates: NormalizedRow[];
  updates: NormalizedRow[];
  relists: NormalizedRow[];
  delists: string[];
  unchanged: number;
}

export interface PlanOptions {
  force: boolean;
  minRatio: number;
  /** Largest share of listed products an import may update or delist without `force`. */
  maxChangeRatio: number;
  untouchedSkus: ReadonlySet<string>;
  /** Set when some rows could not be identified: they may hide a live product, so nothing is delisted. */
  skipDelists?: boolean;
}

export function planImport(
  allRows: NormalizedRow[],
  existing: ExistingProductState[],
  options: PlanOptions,
): ImportPlan {
  const rows = allRows.filter((row) => !options.untouchedSkus.has(row.product.sku));
  const listedCount = existing.filter((product) => product.listed).length;
  if (!options.force) {
    if (rows.length === 0) {
      throw new ImportAbortedError('The export contains no valid rows; refusing to delist the whole catalogue');
    }
    if (rows.length < listedCount * options.minRatio) {
      throw new ImportAbortedError(
        `The export has ${rows.length} valid rows but ${listedCount} products are listed ` +
          `(below ${Math.round(options.minRatio * 100)}%); rerun with --force if this is intended`,
      );
    }
  }

  const existingBySku = new Map(existing.map((product) => [product.sku, product]));
  const plan: ImportPlan = { creates: [], updates: [], relists: [], delists: [], unchanged: 0 };
  const seen = new Set<string>();

  for (const row of rows) {
    seen.add(row.product.sku);
    const current = existingBySku.get(row.product.sku);
    if (!current) {
      plan.creates.push(row);
    } else if (!current.listed) {
      plan.relists.push(row);
    } else if (current.contentHash !== row.hash) {
      plan.updates.push(row);
    } else {
      plan.unchanged += 1;
    }
  }

  if (!options.skipDelists) {
    plan.delists = existing
      .filter((product) => product.listed && !seen.has(product.sku) && !options.untouchedSkus.has(product.sku))
      .map((product) => product.sku)
      .sort();
  }

  // Creates and relists are deliberately not counted: relisting products after a bad forced import must not be blocked.
  const changes = plan.updates.length + plan.delists.length;
  if (!options.force && changes > listedCount * options.maxChangeRatio) {
    throw new ImportAbortedError(
      `The export would change or delist ${changes} of ${listedCount} listed products ` +
        `(above ${Math.round(options.maxChangeRatio * 100)}%); rerun with --force if this is intended`,
    );
  }
  return plan;
}
