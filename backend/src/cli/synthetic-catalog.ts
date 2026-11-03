import { parse } from 'csv-parse/sync';

/**
 * Synthetic products for demonstrating search at scale: built from the real export's vocabulary,
 * deterministic (same export and count → same rows), and labelled in their description.
 */
const FIRST_SKU = 200_001;
const SEED = 0x5eed;
const STATUSES = new Set(['Active', 'Phase-out', 'Discontinued']);

interface ExportRow {
  sku: string;
  name: string;
  chemical_name: string;
  function: string;
  application_area: string;
  region: string;
  certifications: string;
  status: string;
  description: string;
}

function readExport(exportCsv: string): ExportRow[] {
  return parse<ExportRow>(exportCsv, { columns: true, relax_quotes: true, skip_empty_lines: true, trim: true });
}

export function exportRowCount(exportCsv: string): number {
  return readExport(exportCsv).length;
}

/** mulberry32: tiny seeded PRNG so the generated catalogue is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
const csvField = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** CSV data lines (no header, each ending with "\n") for `count` synthetic products. */
export function syntheticCatalogRows(exportCsv: string, count: number): string {
  const rows = readExport(exportCsv);
  const templates = rows.filter(
    (row) => STATUSES.has(row.status) && row.name && row.function && row.application_area && row.region,
  );
  const words = templates.map((row) => row.name.split(/\s+/));
  const brands = unique(words.map((parts) => parts[0]));
  const codes = unique(words.map((parts) => parts[1]));
  const regions = unique(templates.map((row) => row.region));
  const certifications = unique(templates.flatMap((row) => row.certifications.split('|').map((c) => c.trim())));
  const tails = unique(templates.map((row) => row.description.split('. ').slice(1).join('. ')));

  const realSkus = new Set(rows.map((row) => row.sku.toUpperCase()));
  const random = seededRandom(SEED);
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
  const status = (): string => {
    const x = random();
    // Stryker disable next-line EqualityOperator: `<` vs `<=` differs only if random() returns exactly 0.8 or 0.93
    return x < 0.8 ? 'Active' : x < 0.93 ? 'Phase-out' : 'Discontinued';
  };

  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const sku = `P-${FIRST_SKU + i}`;
    if (realSkus.has(sku)) {
      throw new Error(`Synthetic SKU ${sku} collides with a product in the export`);
    }
    const template = pick(templates);
    const line = [
      sku,
      `${pick(brands)} ${pick(codes)} ${100 + Math.floor(random() * 900)}`,
      template.chemical_name,
      template.function,
      template.application_area,
      pick(regions),
      // Stryker disable next-line EqualityOperator: `<` vs `<=` differs only if random() returns exactly 0.25
      certifications.filter(() => random() < 0.25).join('|'),
      status(),
      String(1995 + Math.floor(random() * 31)),
      `Synthetic demo product. ${template.function} based on ${template.chemical_name} for ` +
        `${template.application_area.toLowerCase()} applications. ${pick(tails)}`,
    ];
    lines.push(`${line.map(csvField).join(',')}\n`);
  }
  return lines.join('');
}
