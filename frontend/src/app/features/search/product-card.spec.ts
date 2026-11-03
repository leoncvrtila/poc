import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { ProductSummary } from '../../core/api/api.models';
import { CompareStore } from '../compare/compare-store';
import { ProductCard } from './product-card';

const summary: ProductSummary = {
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
};

describe('ProductCard', () => {
  let fixture: ComponentFixture<ProductCard>;

  const link = () => fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
  const checkbox = () => fixture.nativeElement.querySelector('#compare-P-10001') as HTMLInputElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'products/:sku', children: [] }])] });
    fixture = TestBed.createComponent(ProductCard);
    fixture.componentRef.setInput('product', summary);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('links the product name to the product page', () => {
    expect(link().getAttribute('href')).toBe('/products/P-10001');
    expect(link().textContent?.trim()).toBe('Quorin SF 470');
  });

  it('keeps the compare checkbox outside the link, so ticking it does not open the product', async () => {
    expect(link().contains(checkbox())).toBe(false);

    checkbox().click();

    expect(TestBed.inject(CompareStore).skus()).toEqual(['P-10001']);
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');
  });
});
