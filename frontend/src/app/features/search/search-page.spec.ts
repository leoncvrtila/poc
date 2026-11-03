import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { Paginator } from 'primeng/paginator';
import { of, throwError } from 'rxjs';
import type { SearchResponse } from '../../core/api/api.models';
import { ProductsApi } from '../../core/api/products-api';
import { SearchPage } from './search-page';

const response: SearchResponse = {
  items: [
    {
      sku: 'P-10001',
      displayName: 'Quorin SF 470',
      chemicalName: 'Sodium Laureth Sulfate',
      function: 'Surfactant',
      applicationArea: 'Home Care',
      region: 'EMEA',
      certifications: ['Kosher'],
      status: 'ACTIVE',
      launchYear: 2012,
      ratingAverage: 4.5,
      reviewCount: 2,
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
  degraded: false,
  facets: {
    function: [{ value: 'Surfactant', count: 1, selected: false }],
    applicationArea: [],
    region: [],
    status: [{ value: 'ACTIVE', count: 1, selected: true }],
    certification: [],
  },
};

describe('SearchPage', () => {
  let api: { search: jest.Mock };

  beforeEach(() => {
    api = { search: jest.fn().mockReturnValue(of(response)) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'products', component: SearchPage },
          { path: 'products/:sku', children: [] },
        ]),
        { provide: ProductsApi, useValue: api },
        MessageService,
      ],
    });
  });

  it('searches with the state from the URL and renders results', async () => {
    const harness = await RouterTestingHarness.create('/products?q=laureth');

    expect(api.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'laureth', status: ['ACTIVE', 'PHASE_OUT'] }));
    expect(harness.routeNativeElement?.textContent).toContain('Quorin SF 470');
    expect(harness.routeNativeElement?.textContent).toContain('1 product');
  });

  it('writes a toggled facet into the URL and goes back to page 1', async () => {
    const harness = await RouterTestingHarness.create('/products?q=laureth&page=3');
    const page = harness.routeDebugElement!.componentInstance as SearchPage;

    page.onToggle({ facet: 'function', value: 'Surfactant' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/products?q=laureth&function=Surfactant');
  });

  it('shows a friendly message when search is unavailable', async () => {
    api.search.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));

    const harness = await RouterTestingHarness.create('/products');

    expect(harness.routeNativeElement?.textContent).toContain('Search is temporarily unavailable');
  });

  it('warns when search is running in limited mode', async () => {
    api.search.mockReturnValue(of({ ...response, degraded: true }));

    const harness = await RouterTestingHarness.create('/products');

    expect(harness.routeNativeElement?.textContent).toContain('Search is running in limited mode');
  });

  it('shows no limited-mode warning for normal results', async () => {
    const harness = await RouterTestingHarness.create('/products');

    expect(harness.routeNativeElement?.textContent).not.toContain('Search is running in limited mode');
  });

  it('pages only through the results the search engine can serve', async () => {
    api.search.mockReturnValue(of({ ...response, total: 464_807, totalPages: 500, pageSize: 20 }));

    const harness = await RouterTestingHarness.create('/products');
    const paginator = harness.routeDebugElement!.query(By.directive(Paginator)).componentInstance as Paginator;

    expect(paginator.totalRecords).toBe(10_000);
    expect(paginator.getPageCount()).toBe(500);
    expect(harness.routeNativeElement?.textContent).toContain('464807 products');
    expect(harness.routeNativeElement?.textContent).toContain('Only the first 10000 results can be browsed');
  });

  it('pages through every result when they all fit in the browsable window', async () => {
    api.search.mockReturnValue(of({ ...response, total: 45, totalPages: 3, pageSize: 20 }));

    const harness = await RouterTestingHarness.create('/products');
    const paginator = harness.routeDebugElement!.query(By.directive(Paginator)).componentInstance as Paginator;

    expect(paginator.totalRecords).toBe(45);
    expect(harness.routeNativeElement?.textContent).not.toContain('can be browsed');
  });

  it('re-applies a previously typed term after navigating back to an empty query', async () => {
    const harness = await RouterTestingHarness.create('/products?q=gel');
    const page = harness.routeDebugElement!.componentInstance as SearchPage;
    await harness.navigateByUrl('/products');

    page.onSearchInput('gel');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/products?q=gel');
  });

  it('lets the customer pick results for comparison', async () => {
    const harness = await RouterTestingHarness.create('/products');

    (harness.routeNativeElement!.querySelector('#compare-P-10001') as HTMLInputElement).click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('1 of 3 selected');
  });
});
