import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { CompareStore } from './compare-store';
import { CompareToggle } from './compare-toggle';

describe('CompareToggle', () => {
  let fixture: ComponentFixture<CompareToggle>;
  let store: CompareStore;

  const box = () => fixture.nativeElement.querySelector('#compare-P-1') as HTMLInputElement;
  const flush = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    store = TestBed.inject(CompareStore);
    fixture = TestBed.createComponent(CompareToggle);
    fixture.componentRef.setInput('product', { sku: 'P-1', displayName: 'Gel One' });
    await flush();
  });

  it('adds the product to the comparison and removes it again', async () => {
    box().click();
    await flush();
    expect(store.skus()).toEqual(['P-1']);
    expect(box().checked).toBe(true);

    box().click();
    await flush();
    expect(store.skus()).toEqual([]);
    expect(box().checked).toBe(false);
  });

  it('ticks the box when the visible label is clicked', async () => {
    (fixture.nativeElement.querySelector('label') as HTMLLabelElement).click();
    await flush();

    expect(store.skus()).toEqual(['P-1']);
  });

  it('is enabled again once the selection has room', async () => {
    for (const sku of ['P-2', 'P-3', 'P-4']) {
      store.toggle({ sku, displayName: sku });
    }
    await flush();
    store.remove('P-4');
    await flush();

    expect(box().disabled).toBe(false);
  });

  it('names the product for screen readers', () => {
    expect(box().getAttribute('aria-label')).toBe('Compare Gel One');
  });

  it('is disabled when three other products are selected', async () => {
    for (const sku of ['P-2', 'P-3', 'P-4']) {
      store.toggle({ sku, displayName: sku });
    }
    await flush();

    expect(box().disabled).toBe(true);
  });

  it('stays enabled for a product that is part of a full selection', async () => {
    for (const sku of ['P-1', 'P-2', 'P-3']) {
      store.toggle({ sku, displayName: sku });
    }
    await flush();

    expect(box().disabled).toBe(false);
    expect(box().checked).toBe(true);
  });
});
