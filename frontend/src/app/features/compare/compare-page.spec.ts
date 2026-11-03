import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import type { ProductDetail, RatingSummary } from '../../core/api/api.models';
import { ProductsApi } from '../../core/api/products-api';
import { ComparePage } from './compare-page';
import { CompareStore } from './compare-store';

function product(sku: string, overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    sku,
    name: null,
    displayName: `Product ${sku}`,
    chemicalName: 'Polysorbate 80',
    function: 'Emulsifier',
    applicationArea: 'Personal Care',
    region: 'EMEA',
    certifications: [],
    status: 'ACTIVE',
    launchYear: 2017,
    description: 'Enables cold-process formulation.',
    listed: true,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const rating = (average: number | null, count: number): RatingSummary => ({
  average,
  count,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
});

const catalogue: Record<string, ProductDetail> = {
  'P-1': product('P-1', { displayName: 'Gel One', certifications: ['Kosher', 'Vegan'] }),
  'P-2': product('P-2', { displayName: 'Gel Two', region: 'Global', listed: false, certifications: ['Halal'] }),
};

const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

describe('ComparePage', () => {
  let api: { getProduct: jest.Mock; getRatingSummary: jest.Mock };

  async function open(url: string) {
    const harness = await RouterTestingHarness.create(url);
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness;
  }
  const root = (harness: RouterTestingHarness) => harness.routeNativeElement as HTMLElement;
  const button = (harness: RouterTestingHarness, label: string) =>
    [...root(harness).querySelectorAll('button')].find(
      (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
    ) as HTMLButtonElement;

  beforeEach(() => {
    api = {
      getProduct: jest.fn((sku: string) =>
        catalogue[sku] ? of(catalogue[sku]) : throwError(() => new HttpErrorResponse({ status: 404 })),
      ),
      getRatingSummary: jest.fn((sku: string) => of(sku === 'P-2' ? rating(null, 0) : rating(4.5, 2))),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'compare', component: ComparePage },
          { path: 'products', children: [] },
          { path: 'products/:sku', children: [] },
        ]),
        // In-memory history, so tests can check where "Back" leads.
        provideLocationMocks(),
        { provide: ProductsApi, useValue: api },
        MessageService,
      ],
    });
  });

  it('shows the products from the URL side by side', async () => {
    const harness = await open('/compare?sku=P-1&sku=P-2');
    const headers = [...root(harness).querySelectorAll('thead th')].map((th) => squash(th.textContent));

    expect(headers).toHaveLength(2);
    expect(headers[0]).toContain('Gel One');
    expect(headers[0]).toContain('4.5 (2)');
    expect(headers[1]).toContain('Gel Two');
    expect(headers[1]).toContain('No longer in the catalogue');
    expect(headers[1]).toContain('No reviews yet');
    expect(root(harness).querySelector('a[href="/products/P-2"]')).not.toBeNull();
    expect(root(harness).textContent).not.toContain('Add at least one more product');
  });

  it('marks the attributes the products share', async () => {
    const harness = await open('/compare?sku=P-1&sku=P-2');
    const sameLabels = [...root(harness).querySelectorAll('tbody.compare__group--same .compare__label')].map(
      (th) => squash(th.textContent),
    );

    expect(sameLabels).toContain('Function · same for all');
    expect(sameLabels.some((label) => label.startsWith('Region'))).toBe(false);
  });

  it('lists every certification in every column and marks the missing ones', async () => {
    const harness = await open('/compare?sku=P-1&sku=P-2');
    const columns = [...root(harness).querySelectorAll('.compare__certs')].map((list) =>
      [...list.querySelectorAll('li')].map((li) => squash(li.textContent)),
    );

    expect(columns).toEqual([
      ['Halal (not certified)', 'Kosher', 'Vegan'],
      ['Halal', 'Kosher (not certified)', 'Vegan (not certified)'],
    ]);
    expect(root(harness).querySelectorAll('.compare__cert--missing')).toHaveLength(3);
  });

  it('still compares a product whose rating cannot be loaded', async () => {
    api.getRatingSummary.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));

    const harness = await open('/compare?sku=P-1&sku=P-2');

    expect(root(harness).textContent).toContain('Gel One');
    expect(root(harness).textContent).toContain('Rating unavailable');
  });

  it('keeps a column for a SKU that does not exist or fails to load', async () => {
    api.getProduct.mockImplementation((sku: string) =>
      sku === 'P-1'
        ? of(catalogue['P-1'])
        : throwError(() => new HttpErrorResponse({ status: sku === 'P-404' ? 404 : 500 })),
    );

    const harness = await open('/compare?sku=P-1&sku=P-404&sku=P-500');

    expect(root(harness).textContent).toContain('Gel One');
    expect(root(harness).textContent).toContain('Product not found');
    expect(root(harness).textContent).toContain('Could not be loaded');
    const headers = [...root(harness).querySelectorAll('thead th')].map((th) => squash(th.textContent));
    expect(headers).toHaveLength(3);
    expect(headers[1]).toContain('P-404');
    expect(headers[1]).toContain('Product not found');
    expect(headers[2]).toContain('P-500');
    expect(headers[2]).toContain('Could not be loaded');
    expect(root(harness).textContent).toContain('Add at least one more product to compare');
  });

  it('keeps keyboard focus on the page after removing a product', async () => {
    const harness = await open('/compare?sku=P-1&sku=P-2');
    const remove = button(harness, 'Remove Gel Two from comparison');

    remove.focus();
    remove.click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(document.activeElement).toBe(root(harness).querySelector('h1'));
  });

  it('removes a product from the URL and the selection without reloading the others', async () => {
    const store = TestBed.inject(CompareStore);
    store.toggle({ sku: 'P-1', displayName: 'Gel One' });
    store.toggle({ sku: 'P-2', displayName: 'Gel Two' });
    const harness = await open('/compare?sku=P-1&sku=P-2');

    button(harness, 'Remove Gel Two from comparison').click();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe('/compare?sku=P-1');
    expect(store.skus()).toEqual(['P-1']);
    expect(root(harness).textContent).not.toContain('Gel Two');
    expect(api.getProduct).toHaveBeenCalledTimes(2);
  });

  it('goes back to the results after removing a product, not to the removed product', async () => {
    const harness = await RouterTestingHarness.create('/products');
    await harness.navigateByUrl('/compare?sku=P-1&sku=P-2');
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();

    button(harness, 'Remove Gel Two from comparison').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    button(harness, 'Back').click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Location).path()).toBe('/products');
  });

  it('goes to the product list from a shared comparison, even after removing a product', async () => {
    const harness = await open('/compare?sku=P-1&sku=P-2');

    button(harness, 'Remove Gel Two from comparison').click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    button(harness, 'Back').click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/products');
  });

  it('invites the customer to pick products when the URL names none', async () => {
    const harness = await open('/compare');

    expect(root(harness).textContent).toContain('Browse products');
    expect(api.getProduct).not.toHaveBeenCalled();
  });

  it('asks for a second product when only one is left', async () => {
    const harness = await open('/compare?sku=P-1');

    expect(root(harness).textContent).toContain('Add at least one more product to compare');
  });
});
