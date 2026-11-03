import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'products' },
  {
    path: 'products',
    title: 'Products · Product Finder',
    loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
  },
  {
    path: 'products/:sku',
    loadComponent: () => import('./features/product/product-page').then((m) => m.ProductPage),
  },
  {
    path: 'compare',
    title: 'Compare products · Product Finder',
    loadComponent: () => import('./features/compare/compare-page').then((m) => m.ComparePage),
  },
  {
    path: '**',
    title: 'Not found · Product Finder',
    loadComponent: () => import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
