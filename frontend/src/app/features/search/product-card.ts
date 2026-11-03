import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import type { ProductSummary } from '../../core/api/api.models';
import { STATUS_LABEL, STATUS_SEVERITY } from '../../shared/product-status';
import { StarRatingView } from '../../shared/star-rating';
import { CompareToggle } from '../compare/compare-toggle';

@Component({
  selector: 'app-product-card',
  imports: [RouterLink, TagModule, StarRatingView, CompareToggle],
  template: `
    <article class="card">
      <div class="card__header">
        <h2 class="card__title">
          <a class="card__link" [routerLink]="['/products', product().sku]">{{ product().displayName }}</a>
        </h2>
        @if (product().status !== 'ACTIVE') {
          <p-tag [value]="statusLabel()" [severity]="statusSeverity()" />
        }
      </div>
      <p class="card__meta muted">{{ product().sku }} · {{ product().chemicalName }}</p>
      <p class="card__facts">{{ product().function }} · {{ product().applicationArea }} · {{ product().region }}</p>
      <div class="card__footer">
        @if (product().reviewCount > 0) {
          <app-star-rating [value]="product().ratingAverage" />
          <span class="muted">{{ product().ratingAverage }} ({{ product().reviewCount }})</span>
        } @else {
          <span class="muted">No reviews yet</span>
        }
        <app-compare-toggle class="card__compare" [product]="product()" />
      </div>
    </article>
  `,
  styles: `
    .card { position: relative; height: 100%; padding: 1rem; border-radius: 0.75rem; background: var(--p-surface-0);
            border: 1px solid var(--p-surface-200); transition: box-shadow 0.15s; }
    .card:hover { box-shadow: 0 4px 14px rgb(0 0 0 / 0.08); }
    .card__header { display: flex; justify-content: space-between; gap: 0.5rem; align-items: start; }
    .card__title { margin: 0; font-size: 1.05rem; }
    /* The link's overlay makes the whole card clickable; a checkbox inside a link would be invalid HTML. */
    .card__link { color: inherit; text-decoration: none; }
    .card__link::after { content: ''; position: absolute; inset: 0; border-radius: 0.75rem; }
    .card__link:focus-visible { outline: none; }
    .card__link:focus-visible::after { outline: 2px solid var(--p-primary-color); outline-offset: 2px; }
    .card__meta, .card__facts { margin: 0.35rem 0 0; font-size: 0.9rem; }
    .card__footer { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.75rem; font-size: 0.875rem; }
    .card__compare { position: relative; z-index: 1; margin-left: auto; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCard {
  readonly product = input.required<ProductSummary>();

  protected readonly statusLabel = computed(() => STATUS_LABEL[this.product().status]);
  protected readonly statusSeverity = computed(() => STATUS_SEVERITY[this.product().status]);
}
