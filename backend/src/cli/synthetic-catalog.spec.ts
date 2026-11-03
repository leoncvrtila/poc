import { readCsvRows } from '../modules/catalog/import/csv-source';
import { normalizeRow } from '../modules/catalog/import/normalize-row';
import { exportRowCount, syntheticCatalogRows } from './synthetic-catalog';

// Inline excerpt of data/products.csv: the Stryker sandbox only contains the backend folder.
const EXPORT_CSV = `sku,name,chemical_name,function,application_area,region,certifications,status,launch_year,description
P-10001,Quorin SF 470,Sodium Laureth Sulfate,Surfactant,Home Care,EMEA,Kosher|RSPO Mass Balance,Active,2012,Surfactant based on Sodium Laureth Sulfate for home care applications. Readily biodegradable and easy to process.
P-10002,Novarel EF 240,Polysorbate 80,Emulsifier,Agriculture,Global,Halal|RSPO Mass Balance|Vegan,Active,2005,Emulsifier based on Polysorbate 80 for agriculture applications. Forms stable emulsions over a wide pH range.
P-10003,Velumin EF 650,Mono- and Diglycerides,Emulsifier,Food & Nutrition,EMEA,Kosher|RSPO Mass Balance|Readily Biodegradable,Phase-out,2016,Emulsifier based on Mono- and Diglycerides for food & nutrition applications. Improves dispersion of active ingredients.
P-10004,Quorin EF 890,Polysorbate 80,Emulsifier,Personal Care,Asia Pacific,,Active,2017,Emulsifier based on Polysorbate 80 for personal care applications. Enables cold-process formulation.
P-10005,Quorin PR 650,Potassium Sorbate,Preservative,Home Care,Asia Pacific,REACH Registered|Vegan,Active,2007,Preservative based on Potassium Sorbate for home care applications. Effective over a wide pH range.
P-10006,Ternix SV 480,Propylene Glycol,Solvent,Coatings,North America,,Active,2022,Solvent based on Propylene Glycol for coatings applications. Excellent solvency for resins and actives.
P-10007,Novarel PR 590,Sodium Benzoate,Preservative,Personal Care,Global,Kosher|RSPO Mass Balance|Readily Biodegradable,Discontinued,2023,Preservative based on Sodium Benzoate for personal care applications. Effective over a wide pH range.
P-10008,Siltera SV 820,Ethyl Lactate,Solvent,Coatings,Global,,active,2019,Solvent based on Ethyl Lactate for coatings applications. Bio-based grade available.
`;
const HEADER = EXPORT_CSV.split(/\r?\n/)[0];

describe('syntheticCatalogRows', () => {
  const generateFrom = (exportCsv: string, count: number) => {
    const { rows, issues } = readCsvRows(`${HEADER}\n${syntheticCatalogRows(exportCsv, count)}`);
    expect(issues).toEqual([]);
    return rows;
  };
  const generate = (count: number) => generateFrom(EXPORT_CSV, count);

  it('returns nothing for a count of 0 or less', () => {
    expect(syntheticCatalogRows(EXPORT_CSV, 0)).toBe('');
    expect(syntheticCatalogRows(EXPORT_CSV, -5)).toBe('');
  });

  it('returns exactly one line per requested product', () => {
    const csv = syntheticCatalogRows(EXPORT_CSV, 500);

    expect(csv.endsWith('\n')).toBe(true);
    expect(csv.split('\n')).toHaveLength(501);
  });

  it('is deterministic', () => {
    expect(syntheticCatalogRows(EXPORT_CSV, 300)).toBe(syntheticCatalogRows(EXPORT_CSV, 300));
  });

  it('produces rows the import accepts without errors', () => {
    for (const row of generate(500)) {
      const { product, issues } = normalizeRow(row, 2026);

      expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(product).not.toBeNull();
    }
  });

  it('numbers SKUs uniquely from P-200001, none of them in the export', () => {
    const skus = generate(500).map((row) => row.values.sku);
    const exportSkus = new Set(readCsvRows(EXPORT_CSV).rows.map((row) => row.values.sku));

    expect(skus[0]).toBe('P-200001');
    expect(skus[499]).toBe('P-200500');
    expect(new Set(skus).size).toBe(500);
    expect(skus.some((sku) => exportSkus.has(sku))).toBe(false);
  });

  it('labels every description as synthetic', () => {
    for (const row of generate(200)) {
      expect(row.values.description.startsWith('Synthetic demo product.')).toBe(true);
    }
  });

  it('builds names, years, statuses and certifications from the export vocabulary', () => {
    const rows = generate(2000).map((row) => row.values);
    const exportCerts = new Set(
      readCsvRows(EXPORT_CSV).rows.flatMap((row) => row.values.certifications.split('|').map((c) => c.trim())),
    );
    const statusShare = (status: string) => rows.filter((row) => row.status === status).length / rows.length;

    for (const row of rows) {
      expect(row.name).toMatch(/^\S+ \S+ [1-9]\d{2}$/);
      expect(Number(row.launch_year)).toBeGreaterThanOrEqual(1995);
      expect(Number(row.launch_year)).toBeLessThanOrEqual(2025);
      for (const cert of row.certifications.split('|').filter(Boolean)) {
        expect(exportCerts.has(cert)).toBe(true);
      }
    }
    expect(Math.min(...rows.map((row) => Number(row.launch_year)))).toBeLessThanOrEqual(1996);
    expect(Math.max(...rows.map((row) => Number(row.launch_year)))).toBeGreaterThanOrEqual(2024);
    expect(statusShare('Active')).toBeGreaterThan(0.7);
    expect(statusShare('Active')).toBeLessThan(0.9);
    expect(statusShare('Phase-out')).toBeGreaterThan(0.07);
    expect(statusShare('Phase-out')).toBeLessThan(0.2);
    expect(statusShare('Discontinued')).toBeGreaterThan(0.02);
    expect(statusShare('Discontinued')).toBeLessThan(0.12);
    expect(rows.some((row) => row.certifications.includes('|'))).toBe(true);
    expect(rows.some((row) => row.certifications === '')).toBe(true);
  });

  it('only uses the function, area and region values of the export', () => {
    const exported = readCsvRows(EXPORT_CSV).rows.map((row) => row.values);
    const functions = new Set(exported.map((row) => row.function));
    const areas = new Set(exported.map((row) => row.application_area));
    const regions = new Set(exported.map((row) => row.region));

    for (const row of generate(300).map((r) => r.values)) {
      expect(functions.has(row.function)).toBe(true);
      expect(areas.has(row.application_area)).toBe(true);
      expect(regions.has(row.region)).toBe(true);
    }
  });

  it('quotes fields that contain commas, quotes or newlines', () => {
    const csv = [
      HEADER,
      'P-1,Alpha AB 100,"Acid, ""special""",Surfactant,Home Care,EMEA,Vegan,Active,2010,"Surfactant. Line one',
      'line two, with comma"',
    ].join('\n');

    const rows = readCsvRows(`${HEADER}\n${syntheticCatalogRows(csv, 20)}`).rows;

    expect(rows).toHaveLength(20);
    expect(rows[0].values.chemical_name).toBe('Acid, "special"');
    expect(rows[0].values.description).toContain('Acid, "special"');
  });

  it('keeps the same rows for the same export (golden output)', () => {
    expect(syntheticCatalogRows(EXPORT_CSV, 3).split('\n')).toEqual([
      'P-200001,Novarel SV 191,Potassium Sorbate,Preservative,Home Care,Global,,Active,2015,Synthetic demo product. Preservative based on Potassium Sorbate for home care applications. Improves dispersion of active ingredients.',
      'P-200002,Velumin SV 797,Mono- and Diglycerides,Emulsifier,Food & Nutrition,EMEA,Kosher|Vegan|REACH Registered,Active,2011,Synthetic demo product. Emulsifier based on Mono- and Diglycerides for food & nutrition applications. Forms stable emulsions over a wide pH range.',
      'P-200003,Quorin PR 185,Sodium Benzoate,Preservative,Personal Care,Asia Pacific,Vegan,Active,1998,Synthetic demo product. Preservative based on Sodium Benzoate for personal care applications. Forms stable emulsions over a wide pH range.',
      '',
    ]);
  });

  it('never leaves empty certification tokens', () => {
    for (const row of generate(500)) {
      expect(row.values.certifications).not.toMatch(/^\||\|\||\|$/);
    }
  });

  it('ignores rows that cannot serve as a template', () => {
    const unusable = [
      'X-1,,Bogus Chem 1,Surfactant,Home Care,EMEA,Vegan,Active,2010,No name. Tail one.',
      'X-2,Alpha AB 100,Bogus Chem 2,,Home Care,EMEA,Vegan,Active,2010,No function. Tail two.',
      'X-3,Alpha AB 100,Bogus Chem 3,Surfactant,,EMEA,Vegan,Active,2010,No area. Tail three.',
      'X-4,Alpha AB 100,Bogus Chem 4,Surfactant,Home Care,,Vegan,Active,2010,No region. Tail four.',
      'X-5,Alpha AB 100,Bogus Chem 5,Surfactant,Home Care,EMEA,Vegan,Retired,2010,Bad status. Tail five.',
    ];
    const csv = EXPORT_CSV + unusable.map((line) => `${line}\n`).join('');

    const chemicals = generateFrom(csv, 300).map((row) => row.values.chemical_name);

    expect(chemicals.some((name) => name.startsWith('Bogus'))).toBe(false);
  });

  it('trims padded fields and keeps multi-sentence descriptions intact', () => {
    const csv = `${HEADER}\nX-1, Zed  AB 100 , Pad Chem , Surfactant , Home Care , EMEA , Vegan | Halal , Active , 2010 , Padded. Tail one. Tail two.\n`;

    for (const row of generateFrom(csv, 50)) {
      expect(row.values.name).toMatch(/^Zed AB \d{3}$/);
      expect(row.values.chemical_name).toBe('Pad Chem');
      expect(row.values.certifications).toMatch(/^(Halal|Vegan|Vegan\|Halal|)$/);
      expect(row.values.description).toContain('for home care applications. Tail one. Tail two.');
    }
  });

  it('tolerates blank lines and stray quotes in the export', () => {
    const csv = `${EXPORT_CSV}
X-9,Alpha AB 100,Water,Solvent,Home Care,EMEA,,Active,2010,Solvent. Fits 5" tubes.
`;

    expect(generateFrom(csv, 5)).toHaveLength(5);
  });

  it('refuses an export whose SKUs collide with the synthetic range', () => {
    const csv = `${EXPORT_CSV.replace(/\n?$/, '\n')}P-200001,Colliding AB 100,Water,Solvent,Home Care,EMEA,,Active,2010,Real.\n`;

    expect(() => syntheticCatalogRows(csv, 5)).toThrow('P-200001');
  });
});

describe('exportRowCount', () => {
  it('counts the data rows of the export', () => {
    expect(exportRowCount(EXPORT_CSV)).toBe(8);
  });
});
