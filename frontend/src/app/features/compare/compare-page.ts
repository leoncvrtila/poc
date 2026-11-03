import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { catchError, forkJoin, map, type Observable, of, shareReplay, startWith, switchMap } from 'rxjs';
import type { ProductDetail, RatingSummary } from '../../core/api/api.models';
import { ProductsApi } from '../../core/api/products-api';
import { injectNavigateBack } from '../../shared/navigate-back';
import { ShareButton } from '../../shared/share-button';
import { StarRatingView } from '../../shared/star-rating';
import { MAX_COMPARE, parseCompareSkus } from './compare-selection';
import { CompareStore } from './compare-store';
import { availabilityTag, certificationUnion, compareRows } from './compare-table';

interface CompareColumn {
  sku: string;
  status: 'ready' | 'not-found' | 'error';
  product: ProductDetail | null;
  /** null when the product did not load or its reviews could not be read. */
  rating: RatingSummary | null;
}

type CompareState = { status: 'loading' } | { status: 'ready'; columns: CompareColumn[] };

@Component({
  selector: 'app-compare-page',
  imports: [RouterLink, ButtonModule, MessageModule, SkeletonModule, TagModule, ShareButton, StarRatingView],
  templateUrl: './compare-page.html',
  styleUrl: './compare-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComparePage {
  private readonly api = inject(ProductsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(CompareStore);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  /** Loaded columns by SKU, so removing a product does not reload the others. */
  private readonly columnCache = new Map<string, Observable<CompareColumn>>();

  private readonly skus$ = this.route.queryParamMap.pipe(
    map(parseCompareSkus),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /** The URL is the comparison. The stored selection feeds the "Compare" button and is pruned when a column is removed. */
  protected readonly skus = toSignal(this.skus$, { requireSync: true });
  protected readonly state = toSignal(this.skus$.pipe(switchMap((skus) => this.load(skus))), {
    initialValue: { status: 'loading' } as CompareState,
  });
  protected readonly columns = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.columns : [];
  });
  protected readonly loaded = computed(() => this.columns().filter((column) => column.product).length);
  protected readonly rows = computed(() => compareRows(this.columns().map((column) => column.product)));
  protected readonly certifications = computed(() =>
    certificationUnion(this.columns().map((column) => column.product)),
  );
  protected readonly back = injectNavigateBack();
  protected readonly availability = availabilityTag;
  protected readonly maxCompare = MAX_COMPARE;

  protected remove(sku: string): void {
    this.store.remove(sku);
    // Replace, so "Back" leaves the comparison instead of bringing the removed product back.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sku: this.skus().filter((selected) => selected !== sku) },
      replaceUrl: true,
    });
    // The removed button takes focus with it; keep keyboard and screen-reader users on the page.
    this.heading().nativeElement.focus();
  }

  private load(skus: string[]): Observable<CompareState> {
    if (skus.length === 0) {
      // forkJoin([]) completes without emitting.
      return of<CompareState>({ status: 'ready', columns: [] });
    }
    return forkJoin(skus.map((sku) => this.column(sku))).pipe(
      map((columns): CompareState => ({ status: 'ready', columns })),
      startWith<CompareState>({ status: 'loading' }),
    );
  }

  private column(sku: string): Observable<CompareColumn> {
    const cached = this.columnCache.get(sku);
    if (cached) {
      return cached;
    }
    const column = forkJoin({
      product: this.api.getProduct(sku),
      // A product without a readable rating is still worth comparing.
      rating: this.api.getRatingSummary(sku).pipe(catchError(() => of(null))),
    }).pipe(
      map(({ product, rating }): CompareColumn => ({ sku, status: 'ready', product, rating })),
      catchError((error: HttpErrorResponse) =>
        of<CompareColumn>({ sku, status: error.status === 404 ? 'not-found' : 'error', product: null, rating: null }),
      ),
      shareReplay(1),
    );
    this.columnCache.set(sku, column);
    return column;
  }
}
