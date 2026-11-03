import type { CatalogFacade, ProductView } from '../../catalog';
import type { ReviewsFacade } from '../../reviews';
import type { ProductDocument } from '../domain/product-document';
import type { ProductIndexWriter } from '../domain/ports';
import { SearchIndexer } from './search-indexer.service';

function product(sku: string, listed: boolean): ProductView {
  return {
    sku,
    name: `Name ${sku}`,
    displayName: `Name ${sku}`,
    chemicalName: 'Chem',
    function: 'Surfactant',
    applicationArea: 'Home Care',
    region: 'EMEA',
    certifications: [],
    status: 'ACTIVE',
    launchYear: 2020,
    description: 'desc',
    listed,
    updatedAt: new Date(0),
  };
}

describe('SearchIndexer', () => {
  const catalog = { findBySkus: jest.fn(), listedProducts: jest.fn(), getStatus: jest.fn() };
  const reviews = { getRatingSummaries: jest.fn() };
  const index = {
    upsert: jest.fn<Promise<void>, [ProductDocument[]]>(),
    remove: jest.fn<Promise<void>, [string[]]>(),
    rebuild: jest.fn<Promise<number>, [AsyncIterable<ProductDocument[]>]>(),
    ensureReady: jest.fn<Promise<void>, []>(),
    countDocuments: jest.fn<Promise<number>, []>(),
  };
  let indexer: SearchIndexer;

  beforeEach(() => {
    jest.resetAllMocks();
    reviews.getRatingSummaries.mockResolvedValue(new Map());
    catalog.findBySkus.mockResolvedValue([]);
    indexer = new SearchIndexer(
      catalog as unknown as CatalogFacade,
      reviews as unknown as ReviewsFacade,
      index satisfies ProductIndexWriter,
    );
  });

  it('upserts listed products and removes delisted or unknown ones', async () => {
    catalog.findBySkus.mockResolvedValue([product('P-1', true), product('P-2', false)]);

    await indexer.syncProducts(['P-1', 'P-2', 'P-3']);

    expect(index.upsert).toHaveBeenCalledTimes(1);
    const documents = index.upsert.mock.calls[0][0];
    expect(documents.map((document) => document.sku)).toEqual(['P-1']);
    expect(index.remove).toHaveBeenCalledWith(['P-2', 'P-3']);
  });

  it('merges duplicate SKUs before reading the catalogue', async () => {
    await indexer.syncProducts(['P-1', 'P-1']);

    expect(catalog.findBySkus).toHaveBeenCalledWith(['P-1']);
  });

  it('attaches rating summaries to the documents', async () => {
    catalog.findBySkus.mockResolvedValue([product('P-1', true)]);
    reviews.getRatingSummaries.mockResolvedValue(new Map([['P-1', { average: 4.5, count: 2 }]]));

    await indexer.syncProducts(['P-1']);

    const [document] = index.upsert.mock.calls[0][0];
    expect(document.ratingAverage).toBe(4.5);
    expect(document.reviewCount).toBe(2);
  });

  it('streams mapped batches to the index rebuild', async () => {
    catalog.listedProducts.mockImplementation(async function* () {
      await Promise.resolve();
      yield [product('P-1', true)];
      yield [product('P-2', true), product('P-3', true)];
    });
    const seen: string[][] = [];
    index.rebuild.mockImplementation(async (batches: AsyncIterable<ProductDocument[]>) => {
      let total = 0;
      for await (const batch of batches) {
        seen.push(batch.map((document) => document.sku));
        total += batch.length;
      }
      return total;
    });

    const count = await indexer.rebuildAll();

    expect(count).toBe(3);
    expect(seen).toEqual([['P-1'], ['P-2', 'P-3']]);
  });

  it('reports the listed product count next to the indexed document count', async () => {
    catalog.getStatus.mockResolvedValue({ lastImportAt: null, listedProducts: 7 });
    index.countDocuments.mockResolvedValue(5);

    expect(await indexer.verify()).toEqual({ listedProducts: 7, indexedDocuments: 5 });
  });
});
