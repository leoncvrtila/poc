import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../../app.setup';
import { ProductSearchEngine, SearchUnavailableError } from '../domain/ports';
import type { ProductSearchQuery } from '../domain/search-query';
import { SearchController } from './search.controller';

describe('SearchController', () => {
  let app: INestApplication;
  const search = jest.fn<Promise<unknown>, [ProductSearchQuery]>();
  const server = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: ProductSearchEngine, useValue: { search } }],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useLogger(false);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    search.mockReset();
  });

  it('maps a search outage to 503', async () => {
    search.mockRejectedValue(new SearchUnavailableError('down'));

    const response = await request(server()).get('/api/products').expect(503);

    expect((response.body as { message: string }).message).toBe('Search is temporarily unavailable');
  });

  it('keeps unexpected errors as 500', async () => {
    search.mockRejectedValue(new Error('bug'));

    await request(server()).get('/api/products').expect(500);
  });

  it('applies the default query values', async () => {
    search.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, facets: {} });

    await request(server()).get('/api/products').expect(200);

    expect(search).toHaveBeenCalledTimes(1);
    const [query] = search.mock.calls[0];
    expect(query.filters.status).toEqual(['ACTIVE', 'PHASE_OUT']);
    expect(query.sort).toBe('name');
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
  });

  it('rejects an invalid query with 400 before reaching the engine', async () => {
    await request(server()).get('/api/products?pageSize=500').expect(400);

    expect(search).not.toHaveBeenCalled();
  });
});
