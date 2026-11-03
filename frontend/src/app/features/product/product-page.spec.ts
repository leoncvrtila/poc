import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import type { ProductDetail } from '../../core/api/api.models';
import { ProductsApi } from '../../core/api/products-api';
import { CompareStore } from '../compare/compare-store';
import { ProductPage } from './product-page';

function product(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    sku: 'P-1',
    name: 'Gel One',
    displayName: 'Gel One Display',
    chemicalName: 'Polyacrylate Zeta',
    function: 'Thickener',
    applicationArea: 'Skin care',
    region: 'EMEA',
    certifications: ['ECOCERT', 'COSMOS'],
    status: 'ACTIVE',
    launchYear: 2020,
    description: 'A gel.',
    listed: true,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ProductPage', () => {
  let api: { getProduct: jest.Mock; getReviews: jest.Mock };

  const reviewPage = {
    summary: { average: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
  };

  async function open(getProduct: unknown) {
    api.getProduct.mockReturnValue(getProduct);
    const harness = await RouterTestingHarness.create('/products/P-1');
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness;
  }
  const textOf = (harness: RouterTestingHarness) => harness.routeNativeElement?.textContent ?? '';

  beforeEach(() => {
    api = { getProduct: jest.fn(), getReviews: jest.fn().mockReturnValue(of(reviewPage)) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'products/:sku', component: ProductPage }, { path: 'products', children: [] }], withComponentInputBinding()),
        { provide: ProductsApi, useValue: api },
        MessageService,
      ],
    });
  });

  it('renders a ready product', async () => {
    const harness = await open(of(product()));
    const text = textOf(harness);
    expect(text).toContain('Gel One Display');
    expect(text).toContain('Polyacrylate Zeta');
    expect(text).toContain('Thickener');
    expect(text).toContain('ECOCERT');
    expect(text).toContain('COSMOS');
    expect(TestBed.inject(Title).getTitle()).toBe('Gel One Display · Product Finder');
    expect(text).not.toContain('No longer');
  });

  it('warns when discontinued', async () => {
    const harness = await open(of(product({ status: 'DISCONTINUED' })));
    expect(textOf(harness)).toContain('No longer sold');
  });

  it('closes reviews for delisted products', async () => {
    const harness = await open(of(product({ listed: false })));
    const text = textOf(harness);
    expect(text).toContain('No longer in the catalogue');
    expect(text).toContain('New reviews are closed');
    expect(text).not.toContain('Publish review');
  });

  it('shows not found for 404', async () => {
    const harness = await open(throwError(() => new HttpErrorResponse({ status: 404 })));
    expect(textOf(harness)).toContain('Product not found');
    expect(TestBed.inject(Title).getTitle()).toBe('Product not found · Product Finder');
  });

  it('shows an error for other failures', async () => {
    const harness = await open(throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(textOf(harness)).toContain('could not be loaded');
    expect(TestBed.inject(Title).getTitle()).toBe('Product unavailable · Product Finder');
  });

  it('goes to the product list when there is no in-app history', async () => {
    const harness = await open(of(product()));
    harness.routeDebugElement?.componentInstance.back();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/products');
  });

  it('goes back in history when the user came from inside the app', async () => {
    api.getProduct.mockReturnValue(of(product()));
    const harness = await RouterTestingHarness.create('/products');
    await harness.navigateByUrl('/products/P-1');
    const back = jest.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);

    harness.routeDebugElement?.componentInstance.back();
    await harness.fixture.whenStable();

    expect(back).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe('/products/P-1');
  });

  it('lets the customer add the product to the comparison', async () => {
    const harness = await open(of(product()));

    (harness.routeNativeElement!.querySelector('#compare-P-1') as HTMLInputElement).click();
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(TestBed.inject(CompareStore).skus()).toEqual(['P-1']);
    expect(textOf(harness)).toContain('1 of 3 selected');
  });
});
