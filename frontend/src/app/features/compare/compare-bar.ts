import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { MAX_COMPARE } from './compare-selection';
import { CompareStore } from './compare-store';

/** Sticks to the bottom of the page while products are selected for comparison. */
@Component({
  selector: 'app-compare-bar',
  imports: [ButtonModule, ChipModule],
  template: `
    @if (items().length > 0) {
      <div class="bar" role="region" aria-label="Product comparison">
        <div class="bar__items">
          <span class="bar__count" aria-live="polite" aria-atomic="true">
            {{ items().length }} of {{ max }} selected
            @if (items().length === 1) {
              <span class="muted">· pick one more</span>
            }
          </span>
          @for (item of items(); track item.sku) {
            <p-chip class="bar__chip" [label]="item.displayName" [removable]="true" (onRemove)="store.remove(item.sku)" />
          }
        </div>
        <div class="bar__actions">
          <p-button label="Clear" severity="secondary" [text]="true" (onClick)="store.clear()" />
          <p-button
            label="Compare"
            icon="pi pi-arrow-right"
            iconPos="right"
            [disabled]="items().length < 2"
            (onClick)="open()"
          />
        </div>
      </div>
    }
  `,
  styles: `
    :host { position: sticky; bottom: 0.5rem; z-index: 5; display: block; }
    .bar { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between;
           margin-top: 1rem; padding: 0.75rem 1rem; border-radius: 0.75rem; background: var(--p-surface-0);
           border: 1px solid var(--p-surface-200); box-shadow: 0 4px 14px rgb(0 0 0 / 0.12); }
    .bar__items, .bar__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .bar__count { font-weight: 600; }
    @media (max-width: 600px) { .bar__chip { display: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompareBar {
  protected readonly store = inject(CompareStore);
  private readonly router = inject(Router);

  protected readonly items = this.store.items;
  protected readonly max = MAX_COMPARE;

  protected open(): void {
    void this.router.navigate(['/compare'], { queryParams: { sku: this.store.skus() } });
  }
}
