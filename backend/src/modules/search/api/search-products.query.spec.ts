import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchProductsQueryDto, toSearchQuery } from './search-products.query';

async function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(SearchProductsQueryDto, query);
  const errors = await validate(dto);
  return { dto, errors };
}

describe('SearchProductsQueryDto', () => {
  it('applies defaults: active + phasing-out products, sorted by name without a query', async () => {
    const { dto, errors } = await parse({});
    expect(errors).toEqual([]);
    expect(toSearchQuery(dto)).toEqual({
      q: '',
      filters: { function: [], applicationArea: [], region: [], certification: [], status: ['ACTIVE', 'PHASE_OUT'] },
      sort: 'name',
      page: 1,
      pageSize: 20,
    });
  });

  it('defaults to relevance when there is a query', async () => {
    const { dto } = await parse({ q: '  laureth ' });
    expect(toSearchQuery(dto)).toMatchObject({ q: 'laureth', sort: 'relevance' });
  });

  it('accepts single and repeated facet params', async () => {
    const { dto, errors } = await parse({
      function: 'Surfactant',
      certification: ['Halal', 'Vegan'],
      status: 'DISCONTINUED',
      page: '2',
    });
    expect(errors).toEqual([]);
    expect(toSearchQuery(dto)).toMatchObject({
      filters: { function: ['Surfactant'], certification: ['Halal', 'Vegan'], status: ['DISCONTINUED'] },
      page: 2,
    });
  });

  it.each([{ status: 'RETIRED' }, { sort: 'price' }, { pageSize: '500' }, { page: '0' }, { q: 'x'.repeat(201) }])(
    'rejects %p',
    async (query) => {
      const { errors } = await parse(query);
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it('rejects absurd page numbers and oversized facet lists', async () => {
    expect((await parse({ page: '10001' })).errors).not.toEqual([]);
    expect((await parse({ page: '10000' })).errors).toEqual([]);
    const many = Array.from({ length: 21 }, (_, index) => `F${index}`);
    expect((await parse({ function: many })).errors).not.toEqual([]);
    expect((await parse({ function: many.slice(0, 20) })).errors).toEqual([]);
  });

  it('drops blank facet entries and trims the rest', async () => {
    const { dto } = await parse({ function: ['', '  Solvent  ', '   '], region: '' });
    expect(dto.function).toEqual(['Solvent']);
    expect(dto.region).toEqual([]);
  });

  it('does not throw on a non-string q and reports a validation error instead', async () => {
    const { errors } = await parse({ q: 123 });
    expect(errors.map((error) => error.property)).toContain('q');
  });

  it('treats explicit null or undefined facet values as empty lists', async () => {
    const { dto, errors } = await parse({ function: null, region: undefined, status: null });
    expect(errors).toEqual([]);
    expect(dto.function).toEqual([]);
    expect(dto.region).toEqual([]);
    expect(dto.status).toEqual([]);
  });
});
