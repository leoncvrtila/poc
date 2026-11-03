import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { type SearchQuery, toQueryParams } from '../../features/search/search-query';
import type { CatalogStatus, NewReview, ProductDetail, RatingSummary, Review, ReviewPage, SearchResponse } from './api.models';

@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly http = inject(HttpClient);

  search(query: SearchQuery): Observable<SearchResponse> {
    const params = new HttpParams({ fromObject: toQueryParams(query) as Record<string, string | string[]> });
    return this.http.get<SearchResponse>('/api/products', { params });
  }

  getProduct(sku: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`/api/products/${encodeURIComponent(sku)}`);
  }

  getReviews(sku: string, page: number, pageSize = 10): Observable<ReviewPage> {
    return this.http.get<ReviewPage>(`/api/products/${encodeURIComponent(sku)}/reviews`, { params: { page, pageSize } });
  }

  /** The rating summary comes with every reviews page; a one-review page is the cheapest way to get it. */
  getRatingSummary(sku: string): Observable<RatingSummary> {
    return this.getReviews(sku, 1, 1).pipe(map((page) => page.summary));
  }

  createReview(sku: string, review: NewReview): Observable<Review> {
    return this.http.post<Review>(`/api/products/${encodeURIComponent(sku)}/reviews`, review);
  }

  getCatalogStatus(): Observable<CatalogStatus> {
    return this.http.get<CatalogStatus>('/api/catalog/status');
  }
}
