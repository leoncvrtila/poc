import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Read-only star display: icons are decorative, a visually-hidden text carries the value. */
@Component({
  selector: 'app-star-rating',
  template: `
    <span class="stars" aria-hidden="true">
      @for (filled of icons(); track $index) {
        <i class="pi" [class.pi-star-fill]="filled" [class.pi-star]="!filled"></i>
      }
    </span>
    <span class="visually-hidden">Rated {{ full() }} out of 5</span>
  `,
  styles: `
    :host { display: inline-flex; align-items: center; }
    .stars { display: inline-flex; gap: 0.125rem; color: var(--p-rating-icon-active-color, var(--p-primary-color)); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StarRatingView {
  readonly value = input<number | null>(null);

  protected readonly full = computed(() => Math.max(0, Math.min(5, Math.floor(this.value() ?? 0))));
  protected readonly icons = computed(() => Array.from({ length: 5 }, (_, index) => index < this.full()));
}
