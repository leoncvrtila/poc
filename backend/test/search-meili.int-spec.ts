import type { ProductDocument } from '../src/modules/search/domain/product-document';
import type { ProductSearchQuery } from '../src/modules/search/domain/search-query';
import { MeiliClient } from '../src/modules/search/infrastructure/meili/meili-client';
import { MeiliProductIndex } from '../src/modules/search/infrastructure/meili/meili-product-index';
import { MeiliProductSearch } from '../src/modules/search/infrastructure/meili/meili-product-search';

function doc(sku: string, overrides: Partial<ProductDocument>): ProductDocument {
  return {
    sku,
    displayName: overrides.name ?? sku,
    name: sku,
    chemicalName: 'Generic',
    function: 'Solvent',
    applicationArea: 'Coatings',
    region: 'Global',
    certifications: [],
    status: 'ACTIVE',
    description: 'Test product',
    reviewCount: 0,
    ...overrides,
  };
}

function query(
  overrides: Partial<ProductSearchQuery> = {},
  filters: Partial<ProductSearchQuery['filters']> = {},
): ProductSearchQuery {
  return {
    q: '',
    sort: 'name',
    page: 1,
    pageSize: 20,
    ...overrides,
    filters: {
      function: [],
      applicationArea: [],
      region: [],
      certification: [],
      status: ['ACTIVE', 'PHASE_OUT'],
      ...filters,
    },
  };
}

describe('Meilisearch adapters (integration)', () => {
  const indexUid = `products_it_${Date.now()}`;
  const client = new MeiliClient(process.env.MEILI_URL!, process.env.MEILI_MASTER_KEY!);
  const index = new MeiliProductIndex(client, indexUid);
  const engine = new MeiliProductSearch(client, indexUid);
  const allStatuses = { status: ['ACTIVE', 'PHASE_OUT', 'DISCONTINUED'] };

  beforeAll(async () => {
    await index.upsert([
      doc('P-1', {
        name: 'Quorin SF 470',
        displayName: 'Quorin SF 470',
        function: 'Surfactant',
        certifications: ['Halal', 'Vegan'],
      }),
      doc('P-2', {
        name: 'Quorin SF 471',
        displayName: 'Quorin SF 471',
        function: 'Surfactant',
        status: 'DISCONTINUED',
      }),
      doc('P-3', {
        name: 'Lumexa EF 310',
        displayName: 'Lumexa EF 310',
        function: 'Emulsifier',
        status: 'PHASE_OUT',
        certifications: ['Halal'],
      }),
    ]);
  });

  afterAll(async () => {
    await client.runTask('DELETE', `/indexes/${indexUid}`);
  });

  it('hides discontinued products by default but still counts them in the status facet', async () => {
    const result = await engine.search(query());

    expect(result.items.map((item) => item.sku)).toEqual(['P-3', 'P-1']);
    expect(result.facets.status).toContainEqual({ value: 'DISCONTINUED', count: 1, selected: false });
  });

  it('requires all selected certifications', async () => {
    const result = await engine.search(query({}, { certification: ['Halal', 'Vegan'] }));
    expect(result.items.map((item) => item.sku)).toEqual(['P-1']);
  });

  it('tolerates typos in words but not in numbers', async () => {
    expect((await engine.search(query({ q: 'surfactnt', sort: 'relevance' }))).items.map((i) => i.sku)).toEqual([
      'P-1',
    ]);
    expect((await engine.search(query({ q: '470', sort: 'relevance' }, allStatuses))).items.map((i) => i.sku)).toEqual([
      'P-1',
    ]);
  });

  it('treats hostile filter values as plain values', async () => {
    const result = await engine.search(query({}, { function: ['x" OR status = "DISCONTINUED'] }));
    expect(result.total).toBe(0);
  });

  it('removes and rebuilds documents', async () => {
    await index.remove(['P-1']);
    expect((await engine.search(query({}, allStatuses))).total).toBe(2);

    async function* batches() {
      yield [doc('P-9', { function: 'Polymer' })];
      // Mid-rebuild, the live index still serves the old documents.
      expect((await engine.search(query({}, allStatuses))).total).toBe(2);
    }
    expect(await index.rebuild(batches())).toBe(1);
    expect((await engine.search(query({}, allStatuses))).items.map((i) => i.sku)).toEqual(['P-9']);
  });
});
