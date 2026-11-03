import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import type { CompareItem } from './compare-selection';
import { CompareStore } from './compare-store';

/**
 * "Compare" checkbox for one product. Disabled once the selection is full, unless this product is in it.
 * The store updates synchronously and only ignores a toggle while this box is disabled, so `[ngModel]` always
 * re-syncs (unlike the facet panel, which waits for the next search result).
 */
@Component({
  selector: 'app-compare-toggle',
  imports: [FormsModule, CheckboxModule],
  template: `
    <p-checkbox
      [inputId]="inputId()"
      [binary]="true"
      [ngModel]="selected()"
      [disabled]="disabled()"
      [ariaLabel]="'Compare ' + product().displayName"
      (onChange)="toggle()"
    />
    <label [for]="inputId()" [class.disabled]="disabled()">Compare</label>
  `,
  styles: `
    /* ~44px touch target without changing the footer height: the padding is cancelled by the negative margin. */
    :host { display: inline-flex; align-items: center; font-size: 0.875rem; padding-block: 0.75rem; margin-block: -0.75rem; padding-inline-start: 0.5rem; margin-inline-start: -0.5rem; }
    label { cursor: pointer; padding: 0.75rem 0.5rem 0.75rem 0.4rem; margin: -0.75rem -0.5rem -0.75rem 0; }
    label.disabled { cursor: default; color: var(--p-text-muted-color); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompareToggle {
  private readonly store = inject(CompareStore);

  readonly product = input.required<CompareItem>();

  protected readonly inputId = computed(() => `compare-${this.product().sku}`);
  protected readonly selected = computed(() => this.store.has(this.product().sku));
  protected readonly disabled = computed(() => this.store.full() && !this.selected());

  protected toggle(): void {
    this.store.toggle(this.product());
  }
}
