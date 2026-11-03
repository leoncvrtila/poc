import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CompareBar } from './compare-bar';
import { CompareStore } from './compare-store';

describe('CompareBar', () => {
  let fixture: ComponentFixture<CompareBar>;
  let store: CompareStore;

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const button = (label: string) =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) =>
      b.textContent?.includes(label),
    )!;
  const flush = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'compare', children: [] }])] });
    store = TestBed.inject(CompareStore);
    fixture = TestBed.createComponent(CompareBar);
    await flush();
  });

  it('stays hidden until a product is selected', async () => {
    expect(text().trim()).toBe('');

    store.toggle({ sku: 'P-1', displayName: 'Gel One' });
    await flush();

    expect(text()).toContain('1 of 3 selected');
    expect(text()).toContain('Gel One');
  });

  it('needs two products before it can compare', async () => {
    store.toggle({ sku: 'P-1', displayName: 'Gel One' });
    await flush();

    expect(button('Compare').disabled).toBe(true);
    expect(text()).toContain('pick one more');
  });

  it('opens the comparison for the selected products', async () => {
    store.toggle({ sku: 'P-1', displayName: 'Gel One' });
    store.toggle({ sku: 'P-2', displayName: 'Gel Two' });
    await flush();
    expect(text()).not.toContain('pick one more');

    button('Compare').click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/compare?sku=P-1&sku=P-2');
  });

  it('removes one product from its chip', async () => {
    store.toggle({ sku: 'P-1', displayName: 'Gel One' });
    store.toggle({ sku: 'P-2', displayName: 'Gel Two' });
    await flush();

    const chip = [...(fixture.nativeElement as HTMLElement).querySelectorAll('p-chip')].find((c) =>
      c.textContent?.includes('Gel One'),
    )!;
    chip.querySelector('[role="button"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(store.skus()).toEqual(['P-2']);
    expect(text()).toContain('1 of 3 selected');
  });

  it('clears the selection', async () => {
    store.toggle({ sku: 'P-1', displayName: 'Gel One' });
    await flush();

    button('Clear').click();
    await flush();

    expect(store.items()).toEqual([]);
    expect(text().trim()).toBe('');
  });
});
