import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { FacetName, FacetValue } from '../../core/api/api.models';
import { FacetPanel } from './facet-panel';

function facets(status: FacetValue[]): Record<FacetName, FacetValue[]> {
  return { status, function: [], applicationArea: [], region: [], certification: [] };
}

describe('FacetPanel', () => {
  let fixture: ComponentFixture<FacetPanel>;

  const box = (index: number) => fixture.nativeElement.querySelector(`#facet-status-${index}`) as HTMLInputElement;
  const flush = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(FacetPanel);
    fixture.componentRef.setInput(
      'facets',
      facets([
        { value: 'ACTIVE', count: 140, selected: true },
        { value: 'PHASE_OUT', count: 30, selected: false },
      ]),
    );
    await flush();
  });

  it('reports which value was clicked', () => {
    const toggled = jest.fn();
    fixture.componentInstance.toggled.subscribe(toggled);

    box(1).click();

    expect(toggled).toHaveBeenCalledWith({ facet: 'status', value: 'PHASE_OUT' });
  });

  it('shows the next result even when a click did not change the selection', async () => {
    box(0).click();
    await flush();
    // The page fell back to the default statuses, so ACTIVE is still selected.
    fixture.componentRef.setInput(
      'facets',
      facets([
        { value: 'ACTIVE', count: 140, selected: true },
        { value: 'PHASE_OUT', count: 30, selected: true },
      ]),
    );
    await flush();

    expect(box(0).checked).toBe(true);
    expect(box(1).checked).toBe(true);
  });
});
