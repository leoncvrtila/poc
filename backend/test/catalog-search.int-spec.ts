import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CatalogFacade,
  CatalogModule,
  type CatalogSearchCriteria,
  type CatalogSearchFacet,
  type ProductStatus,
} from '../src/modules/catalog';
import { AppConfigModule } from '../src/shared/config/app-config.module';
import { PrismaModule } from '../src/shared/prisma/prisma.module';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { resetDatabase } from './support/database';

type Filters = Record<CatalogSearchFacet, string[]>;

const NO_FILTERS: Filters = { function: [], applicationArea: [], region: [], status: [], certification: [] };

function criteria(
  overrides: Partial<Omit<CatalogSearchCriteria, 'filters'>> & { filters?: Partial<Filters> } = {},
): CatalogSearchCriteria {
  return {
    q: '',
    sort: 'name',
    page: 1,
    pageSize: 20,
    ...overrides,
    filters: { ...NO_FILTERS, ...overrides.filters },
  };
}

function product(sku: string, overrides: Record<string, unknown> = {}) {
  return {
    sku,
    name: `Name ${sku}`,
    chemicalName: 'Generic chemical',
    function: 'Solvent',
    applicationArea: 'Coatings',
    region: 'Global',
    certifications: [] as string[],
    status: 'ACTIVE' as ProductStatus,
    launchYear: null as number | null,
    description: 'Fixture',
    contentHash: 'hash',
    ...overrides,
  };
}

describe('CatalogFacade.searchProducts (integration)', () => {
  let app: INestApplication;
  let catalog: CatalogFacade;

  async function skus(search: CatalogSearchCriteria): Promise<string[]> {
    return (await catalog.searchProducts(search)).items.map((item) => item.sku);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, CatalogModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    catalog = app.get(CatalogFacade);
    const prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    await prisma.product.createMany({
      data: [
        product('P-10001', {
          name: 'Sodium Laureth Sulfate',
          chemicalName: 'Sodium lauryl ether sulfate',
          function: 'Surfactant',
          region: 'EU',
          certifications: ['Halal', 'Kosher'],
          launchYear: 2015,
        }),
        product('P-10002', {
          name: 'Sodium Chloride',
          chemicalName: 'Sodium chloride',
          function: 'Emulsifier',
          region: 'EU',
          certifications: ['Halal'],
          launchYear: 2020,
        }),
        product('P-10003', {
          name: 'Sulfate Free Ether',
          chemicalName: 'Sulfate free ether',
          function: 'Emulsifier',
          region: 'US',
          certifications: ['Kosher'],
        }),
        product('P-10004', { name: 'Gamma Solvent', status: 'PHASE_OUT', launchYear: 2010 }),
        product('P-10005', { name: 'Delta Solvent', status: 'DISCONTINUED', function: 'Emulsifier' }),
        product('P-10006', { name: null, chemicalName: 'Squalane', function: 'Emollient' }),
        product('P-10007', { name: '100% Pure Oil', function: 'Emollient' }),
        product('P-10008', { name: 'Hidden Surfactant', function: 'Surfactant', listed: false }),
        product('P-10009', { name: 'P-10001 Blend' }),
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires every token to match somewhere across the searchable fields', async () => {
    expect(await skus(criteria({ q: 'sodium sulfate' }))).toEqual(['P-10001']);
  });

  it('matches a partial SKU', async () => {
    expect(await skus(criteria({ q: 'P-1000' }))).toHaveLength(8);
    expect(await skus(criteria({ q: 'P-10003' }))).toEqual(['P-10003']);
  });

  it('is case-insensitive', async () => {
    expect(await skus(criteria({ q: 'SURFACTANT' }))).toEqual(['P-10001']);
  });

  it('treats LIKE wildcards as literal text', async () => {
    expect(await skus(criteria({ q: '%' }))).toEqual(['P-10007']);
    expect(await skus(criteria({ q: '_' }))).toEqual([]);
  });

  it('returns listed products only', async () => {
    expect(await skus(criteria({ q: 'hidden' }))).toEqual([]);
    const page = await catalog.searchProducts(criteria());
    expect(page.total).toBe(8);
    expect(page.items.map((item) => item.sku)).not.toContain('P-10008');
  });

  it('combines filters: OR within a facet, AND across facets, every selected certification', async () => {
    expect(await skus(criteria({ filters: { function: ['Surfactant', 'Emollient'] } }))).toEqual([
      'P-10007',
      'P-10006',
      'P-10001',
    ]);
    expect(await skus(criteria({ filters: { function: ['Emulsifier'], region: ['EU'] } }))).toEqual(['P-10002']);
    expect(await skus(criteria({ filters: { certification: ['Halal', 'Kosher'] } }))).toEqual(['P-10001']);
  });

  it('filters by status, and applies no status filter when none is given', async () => {
    const active = await skus(criteria({ filters: { status: ['ACTIVE'] } }));
    expect(active).not.toContain('P-10004');
    expect(active).not.toContain('P-10005');
    expect(await skus(criteria())).toEqual(expect.arrayContaining(['P-10004', 'P-10005']));
  });

  it('counts facets disjunctively', async () => {
    const page = await catalog.searchProducts(criteria({ filters: { function: ['Emulsifier'] } }));

    expect(page.facetCounts.function).toEqual({ Surfactant: 1, Emulsifier: 3, Solvent: 2, Emollient: 2 });
    expect(page.facetCounts.region).toEqual({ EU: 1, US: 1, Global: 1 });
  });

  it('counts certifications over all filters', async () => {
    const page = await catalog.searchProducts(criteria({ filters: { certification: ['Halal'] } }));

    expect(page.facetCounts.certification).toEqual({ Halal: 2, Kosher: 1 });
  });

  it('sorts by name using the SKU when the name is missing', async () => {
    expect(await skus(criteria({ sort: 'name' }))).toEqual([
      'P-10007',
      'P-10005',
      'P-10004',
      'P-10009',
      'P-10006',
      'P-10002',
      'P-10001',
      'P-10003',
    ]);
  });

  it('sorts by launch year descending with unknown years last', async () => {
    expect(await skus(criteria({ sort: '-launchYear' }))).toEqual([
      'P-10002',
      'P-10001',
      'P-10004',
      'P-10007',
      'P-10005',
      'P-10009',
      'P-10006',
      'P-10003',
    ]);
  });

  it('ranks an exact SKU first, then names starting with the query', async () => {
    // P-10009 sorts before P-10001 by name, so only the relevance ranking puts the exact SKU first.
    expect(await skus(criteria({ q: 'p-10001', sort: 'relevance' }))).toEqual(['P-10001', 'P-10009']);
    // Neither is an exact SKU; both names start with "sod", then name order decides.
    expect(await skus(criteria({ q: 'sod', sort: 'relevance' }))).toEqual(['P-10002', 'P-10001']);
    // A name starting with the query comes before one that merely contains it, although it sorts later by name.
    expect(await skus(criteria({ q: 'sulfate', sort: 'relevance' }))).toEqual(['P-10003', 'P-10001']);
  });

  it('ignores NUL characters in the query instead of failing', async () => {
    expect(await skus(criteria({ q: 'sod\u0000ium chlo\u0000ride' }))).toEqual(['P-10002']);
    expect(await skus(criteria({ q: '\u0000', sort: 'relevance' }))).toHaveLength(8);
  });

  it('keeps the name-prefix ranking when the query contains repeated whitespace', async () => {
    const prisma = app.get(PrismaService);
    const extra = [product('P-10091', { name: 'Acme Red Dye' }), product('P-10092', { name: 'Red Dye Zeta' })];
    await prisma.product.createMany({ data: extra });
    try {
      // "Acme Red Dye" sorts first by name; only the collapsed prefix match puts "Red Dye Zeta" ahead of it.
      expect(await skus(criteria({ q: ' red  \t dye ', sort: 'relevance' }))).toEqual(['P-10092', 'P-10091']);
    } finally {
      await prisma.product.deleteMany({ where: { sku: { in: extra.map((item) => item.sku) } } });
    }
  });

  it('paginates and reports the full total', async () => {
    const page = await catalog.searchProducts(criteria({ page: 2, pageSize: 3 }));

    expect(page.items.map((item) => item.sku)).toEqual(['P-10009', 'P-10006', 'P-10002']);
    expect(page.total).toBe(8);
  });
});
