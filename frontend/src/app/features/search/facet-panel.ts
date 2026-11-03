import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import type { FacetName, FacetValue, ProductStatus } from '../../core/api/api.models';
import { STATUS_LABEL } from '../../shared/product-status';

export interface FacetToggle {
  facet: FacetName;
  value: string;
}

const GROUPS: { name: FacetName; label: string }[] = [
  { name: 'status', label: 'Availability' },
  { name: 'function', label: 'Function' },
  { name: 'applicationArea', label: 'Application area' },
  { name: 'region', label: 'Region' },
  { name: 'certification', label: 'Certifications (all of)' },
];

@Component({
  selector: 'app-facet-panel',
  imports: [FormsModule, CheckboxModule],
  template: `
    @for (group of groups(); track group.name) {
      @if (group.values.length > 0) {
        <fieldset class="facet-group">
          <legend>{{ group.label }}</legend>
          @for (option of group.values; track option.value) {
            <div class="facet-option">
              <p-checkbox
                [inputId]="idPrefix() + group.name + '-' + $index"
                [binary]="true"
                [ngModel]="option.selected"
                (onChange)="toggle(group.name, option.value)"
              />
              <label [for]="idPrefix() + group.name + '-' + $index">
                {{ label(group.name, option.value) }}
                <span class="muted">({{ option.count }})</span>
              </label>
            </div>
          }
        </fieldset>
      }
    }
  `,
  styles: `
    .facet-group { border: 0; margin: 0 0 1.25rem; padding: 0; }
    legend { font-weight: 600; margin-bottom: 0.5rem; }
    .facet-option { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
    label { cursor: pointer; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FacetPanel {
  readonly facets = input<Record<FacetName, FacetValue[]> | null>(null);
  /** Distinguishes the desktop sidebar from the mobile drawer copy so input ids stay unique. */
  readonly idPrefix = input('facet-');
  readonly toggled = output<FacetToggle>();

  /**
   * p-checkbox flips itself on click, and [ngModel] only re-syncs it when the bound value changes. Flipping the
   * clicked option here too lets the next result correct it, even when that result keeps it selected.
   */
  protected readonly groups = linkedSignal(() => {
    const facets = this.facets();
    return facets ? GROUPS.map((group) => ({ ...group, values: facets[group.name] ?? [] })) : [];
  });

  protected toggle(facet: FacetName, value: string): void {
    const flip = (option: FacetValue) => (option.value === value ? { ...option, selected: !option.selected } : option);
    this.groups.update((groups) =>
      groups.map((group) => (group.name === facet ? { ...group, values: group.values.map(flip) } : group)),
    );
    this.toggled.emit({ facet, value });
  }

  protected label(facet: FacetName, value: string): string {
    return facet === 'status' ? STATUS_LABEL[value as ProductStatus] : value;
  }
}
