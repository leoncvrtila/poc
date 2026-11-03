import { ImportAbortedError } from './import-errors';
import { readCsvRows } from './csv-source';

const HEADER = 'sku,name,chemical_name,function,application_area,region,certifications,status,launch_year,description';

describe('readCsvRows', () => {
  it('maps rows to header keys and keeps file line numbers', () => {
    const csv = `${HEADER}\nP-1,Alpha,Glycerin,Emollient,Personal Care,EMEA,Vegan,Active,2020,Nice\nP-2,Beta,Water,Solvent,Coatings,Global,,Active,2021,Fine\n`;

    const { rows, issues } = readCsvRows(csv);

    expect(issues).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      line: 2,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest asymmetric matcher is typed any
      values: expect.objectContaining({ sku: 'P-1', name: 'Alpha', certifications: 'Vegan' }),
    });
    expect(rows[1].line).toBe(3);
  });

  it('handles quoted fields containing commas', () => {
    const csv = `${HEADER}\nP-1,"Alpha, improved",Glycerin,Emollient,Personal Care,EMEA,,Active,2020,"Soft, smooth"\n`;

    const { rows } = readCsvRows(csv);

    expect(rows[0].values.name).toBe('Alpha, improved');
    expect(rows[0].values.description).toBe('Soft, smooth');
  });

  it('reports rows with the wrong number of columns and skips them', () => {
    const csv = `${HEADER}\nP-1,Alpha,Glycerin\n`;

    const { rows, issues } = readCsvRows(csv);

    expect(rows).toEqual([]);
    expect(issues).toEqual([
      { line: 2, sku: 'P-1', field: null, severity: 'error', message: 'Expected 10 columns, got 3' },
    ]);
  });

  it('aborts when a required column is missing', () => {
    expect(() => readCsvRows('sku,name\nP-1,Alpha\n')).toThrow(ImportAbortedError);
    expect(() => readCsvRows('sku,name\nP-1,Alpha\n')).toThrow(/Missing required columns: chemical_name/);
  });

  it('aborts on an empty file', () => {
    expect(() => readCsvRows('')).toThrow('The file is empty');
  });

  it('parses a stray inch mark inside an unquoted field', () => {
    const csv = `${HEADER}
P-1,Drum 5" pack,Glycerin,Emollient,Personal Care,EMEA,,Active,2020,Nice
`;

    const { rows, issues } = readCsvRows(csv);

    expect(issues).toEqual([]);
    expect(rows[0].values.name).toBe('Drum 5" pack');
  });

  it('aborts cleanly on an unclosed quoted field', () => {
    const csv = `${HEADER}
P-1,"Alpha,Glycerin,Emollient,Personal Care,EMEA,,Active,2020,Nice
`;

    expect(() => readCsvRows(csv)).toThrow(ImportAbortedError);
    expect(() => readCsvRows(csv)).toThrow(/^Cannot parse CSV:/);
  });

  it('aborts on duplicate column names', () => {
    const csv = `${HEADER},Name
P-1,Alpha,G,E,P,EMEA,,Active,2020,Nice,Again
`;

    expect(() => readCsvRows(csv)).toThrow(ImportAbortedError);
    expect(() => readCsvRows(csv)).toThrow('Duplicate columns: name');
  });

  it('ignores separator-only lines', () => {
    const csv = `${HEADER}
P-1,Alpha,Glycerin,Emollient,Personal Care,EMEA,,Active,2020,Nice
,,,,,,,,,
`;

    const { rows, issues } = readCsvRows(csv);

    expect(rows).toHaveLength(1);
    expect(issues).toEqual([]);
  });

  it('trims and lower-cases header names', () => {
    const padded = HEADER.split(',')
      .map((h, i) => (i === 0 ? ` ${h.toUpperCase()} ` : h))
      .join(',');
    const { rows } = readCsvRows(`${padded}\nP-1,Alpha,G,E,P,EMEA,,Active,2020,Nice\n`);
    expect(rows[0].values.sku).toBe('P-1');
  });

  it('lists every duplicate or missing column in the message', () => {
    expect(() => readCsvRows(`${HEADER},Name,SKU\n`)).toThrow('Duplicate columns: name, sku');
    expect(() => readCsvRows('sku,name\n')).toThrow(/Missing required columns: chemical_name, function, /);
  });

  it('trims the SKU of a malformed row and copes with the SKU column being absent from it', () => {
    const skuLast = `${HEADER.split(',')
      .filter((h) => h !== 'sku')
      .join(',')},sku`;
    expect(readCsvRows(`${skuLast}\nAlpha,G\n`).issues[0].sku).toBeNull();
    expect(readCsvRows(`${HEADER}\n  P-1  ,Alpha\n`).issues[0].sku).toBe('P-1');
  });
});
