import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { App } from './app';
import { ProductsApi } from './core/api/products-api';

describe('App', () => {
  function footer(getCatalogStatus: unknown): string {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), MessageService, { provide: ProductsApi, useValue: { getCatalogStatus: () => getCatalogStatus } }],
    });
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return (fixture.nativeElement.querySelector('footer').textContent as string).trim();
  }

  it('shows catalogue freshness', () => {
    const text = footer(of({ lastImportAt: '2026-11-02T10:00:00Z', listedProducts: 200 }));
    expect(text).toContain('200 products');
    expect(text).toContain('Catalogue updated');
  });

  it('hides the footer content on error', () => {
    expect(footer(throwError(() => new Error('down')))).toBe('');
  });
});
