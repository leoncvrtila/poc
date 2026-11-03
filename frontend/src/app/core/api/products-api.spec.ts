import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { emptyQuery } from '../../features/search/search-query';
import type { NewReview, RatingSummary } from './api.models';
import { ProductsApi } from './products-api';

describe('ProductsApi', () => {
  let api: ProductsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ProductsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends only non-default search params', () => {
    api.search({ ...emptyQuery(), q: 'gel', function: ['A', 'B'], page: 2 }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/products');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.getAll('function')).toEqual(['A', 'B']);
    expect(req.request.params.get('q')).toBe('gel');
    expect(req.request.params.get('page')).toBe('2');
    for (const key of ['status', 'pageSize', 'sort']) {
      expect(req.request.params.has(key)).toBe(false);
    }
    req.flush({});
  });

  it('encodes the SKU', () => {
    api.getProduct('P 1/2').subscribe();
    http.expectOne('/api/products/P%201%2F2').flush({});
  });

  it('posts a review', () => {
    const body = { authorName: 'Ana', rating: 4, comment: 'Good stuff here.' } as NewReview;
    api.createReview('P-1', body).subscribe();
    const req = http.expectOne('/api/products/P-1/reviews');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('pages reviews', () => {
    api.getReviews('P-1', 3).subscribe();
    const req = http.expectOne((r) => r.url === '/api/products/P-1/reviews');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({});
  });

  it('reads the rating summary from a one-review page', () => {
    const summary: RatingSummary = { average: 4, count: 2, distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 0 } };
    let received: RatingSummary | undefined;
    api.getRatingSummary('P-1').subscribe((value) => (received = value));

    const req = http.expectOne((r) => r.url === '/api/products/P-1/reviews');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('1');
    req.flush({ summary, items: [], page: 1, pageSize: 1, total: 2 });

    expect(received).toEqual(summary);
  });
});
