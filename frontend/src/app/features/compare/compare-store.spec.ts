import { DOCUMENT } from '@angular/common';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CompareStore } from './compare-store';

/** Pinned because the "unreadable" test writes this key directly; a renamed key would let that test pass without testing anything. */
const STORAGE_KEY = 'product-finder.compare';
const item = (sku: string) => ({ sku, displayName: `Product ${sku}` });

describe('CompareStore', () => {
  /** A new store reads session storage again, like a page reload. */
  function reload(document?: unknown): CompareStore {
    const parent = TestBed.inject(Injector);
    const injector = document
      ? Injector.create({ providers: [{ provide: DOCUMENT, useValue: document }], parent })
      : parent;
    return runInInjectionContext(injector, () => new CompareStore());
  }

  afterEach(() => jest.restoreAllMocks());

  it('adds and removes products', () => {
    const store = reload();
    store.toggle(item('P-1'));
    store.toggle(item('P-2'));
    expect(store.skus()).toEqual(['P-1', 'P-2']);
    expect(store.has('P-2')).toBe(true);

    store.toggle(item('P-1'));
    expect(store.items()).toEqual([item('P-2')]);
    expect(store.has('P-1')).toBe(false);
  });

  it('is full at three products', () => {
    const store = reload();
    store.toggle(item('P-1'));
    store.toggle(item('P-2'));
    expect(store.full()).toBe(false);

    store.toggle(item('P-3'));
    expect(store.full()).toBe(true);
  });

  it('removes one product and clears all', () => {
    const store = reload();
    store.toggle(item('P-1'));
    store.toggle(item('P-2'));

    store.remove('P-1');
    expect(store.skus()).toEqual(['P-2']);

    store.clear();
    expect(store.items()).toEqual([]);
  });

  it('keeps the selection across a reload', () => {
    reload().toggle(item('P-1'));

    expect(reload().items()).toEqual([item('P-1')]);
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '')).toEqual([item('P-1')]);
  });

  it('forgets a cleared selection across a reload', () => {
    const store = reload();
    store.toggle(item('P-1'));
    store.clear();

    expect(reload().items()).toEqual([]);
  });

  it('starts empty when the stored value is unreadable', () => {
    sessionStorage.setItem(STORAGE_KEY, '{oops');
    expect(reload().items()).toEqual([]);
  });

  it('works in memory when session storage is blocked', () => {
    const blocked = {
      defaultView: {
        get sessionStorage(): Storage {
          throw new DOMException('blocked', 'SecurityError');
        },
      },
    };
    const store = reload(blocked);

    store.toggle(item('P-1'));

    expect(store.items()).toEqual([item('P-1')]);
  });

  it('works in memory when session storage is full', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const store = reload();

    store.toggle(item('P-1'));

    expect(store.items()).toEqual([item('P-1')]);
    expect(reload().items()).toEqual([]);
  });
});
