import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { DrawerModule } from 'primeng/drawer';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PaginatorModule, type PaginatorState } from 'primeng/paginator';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { catchError, debounceTime, map, merge, of, shareReplay, startWith, Subject, switchMap, tap } from 'rxjs';
import type { SearchResponse, SortOption } from '../../core/api/api.models';
import { ProductsApi } from '../../core/api/products-api';
import { ShareButton } from '../../shared/share-button';
import { CompareBar } from '../compare/compare-bar';
import { FacetPanel, type FacetToggle } from './facet-panel';
import { ProductCard } from './product-card';
import {
  type ActiveFilter,
  activeFilters,
  effectiveSort,
  emptyQuery,
  parseSearchQuery,
  type SearchQuery,
  SORT_CHOICES,
  toggleFacetValue,
  toQueryParams,
} from './search-query';

type SearchState =
  | { status: 'loading' }
  | { status: 'ready'; result: SearchResponse }
  | { status: 'error'; unavailable: boolean };

@Component({
  selector: 'app-search-page',
  imports: [
    FormsModule,
    ButtonModule,
    ChipModule,
    DrawerModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    PaginatorModule,
    SelectModule,
    SkeletonModule,
    CompareBar,
    FacetPanel,
    ProductCard,
    ShareButton,
  ],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ProductsApi);
  private readonly searchInput$ = new Subject<string>();
  private readonly retry$ = new Subject<void>();

  private readonly query$ = this.route.queryParamMap.pipe(
    map(parseSearchQuery),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  protected readonly query = toSignal(this.query$, { requireSync: true });
  /** Last successful result, so facets stay visible while the next search is loading. */
  protected readonly lastResult = signal<SearchResponse | null>(null);
  protected readonly state = toSignal(
    merge(this.query$, this.retry$.pipe(map(() => this.query()))).pipe(
      switchMap((query) =>
        this.api.search(query).pipe(
          tap((result) => this.lastResult.set(result)),
          map((result): SearchState => ({ status: 'ready', result })),
          catchError((error: HttpErrorResponse) => of<SearchState>({ status: 'error', unavailable: error.status === 503 })),
          startWith<SearchState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as SearchState },
  );

  /** Keeps what the user is typing (e.g. a trailing space) until the URL actually changes the query. */
  protected readonly searchText = linkedSignal<string, string>({
    source: () => this.query().q,
    computation: (q, previous) => (previous && previous.value.trim() === q ? previous.value : q),
  });

  protected readonly filtersOpen = signal(false);
  protected readonly sortChoices = SORT_CHOICES;
  protected readonly sort = computed(() => effectiveSort(this.query()));
  protected readonly chips = computed(() => activeFilters(this.query()));
  protected readonly filtersLabel = computed(() => (this.chips().length ? `Filters (${this.chips().length})` : 'Filters'));
  protected readonly result = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.result : null;
  });
  /** The search engine serves at most `totalPages` pages (its result window), which can be fewer than `total` implies. */
  protected readonly browsableTotal = computed(() => {
    const data = this.result();
    return data ? Math.min(data.total, data.totalPages * data.pageSize) : 0;
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    if (state.status !== 'error') {
      return null;
    }
    return state.unavailable
      ? 'Search is temporarily unavailable. Please try again in a moment.'
      : 'Something went wrong while searching.';
  });
  protected readonly skeletons = Array.from({ length: 6 }, (_, index) => index);

  constructor() {
    this.searchInput$
      .pipe(
        debounceTime(300),
        map((value) => value.trim()),
        takeUntilDestroyed(),
      )
      .subscribe((q) => {
        if (q !== this.query().q) {
          this.navigate({ ...this.query(), q, page: 1 });
        }
      });
  }

  onSearchInput(value: string): void {
    this.searchText.set(value);
    this.searchInput$.next(value);
  }

  onRetry(): void {
    this.retry$.next();
  }

  onFirstPage(): void {
    this.navigate({ ...this.query(), page: 1 });
  }

  onToggle(toggle: FacetToggle): void {
    this.navigate(toggleFacetValue(this.query(), toggle.facet, toggle.value));
  }

  onRemoveChip(chip: ActiveFilter): void {
    this.onToggle({ facet: chip.facet, value: chip.value });
  }

  onClearFilters(): void {
    const query = this.query();
    this.navigate({ ...emptyQuery(), q: query.q, sort: query.sort, pageSize: query.pageSize });
  }

  onSortChange(sort: SortOption): void {
    this.navigate({ ...this.query(), sort, page: 1 });
  }

  onPageChange(event: PaginatorState): void {
    const query = this.query();
    this.navigate({ ...query, page: (event.page ?? 0) + 1, pageSize: event.rows ?? query.pageSize });
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  private navigate(query: SearchQuery): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toQueryParams(query) });
  }
}
