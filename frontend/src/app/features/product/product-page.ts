import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import type { ProductDetail } from '../../core/api/api.models';
import { ProductsApi } from '../../core/api/products-api';
import { injectNavigateBack } from '../../shared/navigate-back';
import { STATUS_LABEL, STATUS_SEVERITY } from '../../shared/product-status';
import { ShareButton } from '../../shared/share-button';
import { CompareBar } from '../compare/compare-bar';
import { CompareToggle } from '../compare/compare-toggle';
import { ReviewsSection } from './reviews-section';
import { statusBanner } from './status-banner';

type ProductState =
  | { status: 'loading' }
  | { status: 'ready'; product: ProductDetail }
  | { status: 'not-found' }
  | { status: 'error' };

@Component({
  selector: 'app-product-page',
  imports: [RouterLink, ButtonModule, ChipModule, MessageModule, SkeletonModule, TagModule, ShareButton, ReviewsSection, CompareBar, CompareToggle],
  templateUrl: './product-page.html',
  styleUrl: './product-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPage {
  private readonly api = inject(ProductsApi);
  private readonly title = inject(Title);

  /** Bound from the `:sku` route parameter. */
  readonly sku = input.required<string>();

  /** Back to the results, or to the product list when the page was opened from a shared link. */
  readonly back = injectNavigateBack();

  protected readonly state = toSignal(
    toObservable(this.sku).pipe(
      switchMap((sku) =>
        this.api.getProduct(sku).pipe(
          map((product): ProductState => ({ status: 'ready', product })),
          catchError((error: HttpErrorResponse) => of<ProductState>({ status: error.status === 404 ? 'not-found' : 'error' })),
          startWith<ProductState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as ProductState },
  );

  protected readonly product = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.product : null;
  });
  protected readonly banner = computed(() => {
    const product = this.product();
    return product ? statusBanner(product) : null;
  });
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusSeverity = STATUS_SEVERITY;

  constructor() {
    effect(() => {
      const product = this.product();
      if (product) {
        this.title.setTitle(`${product.displayName} · Product Finder`);
        globalThis.scrollTo?.({ top: 0 });
      }
    });
    effect(() => {
      const status = this.state().status;
      if (status === 'not-found') {
        this.title.setTitle('Product not found · Product Finder');
      } else if (status === 'error') {
        this.title.setTitle('Product unavailable · Product Finder');
      }
    });
  }
}
