import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';
import { type CompareItem, MAX_COMPARE, parseStoredItems, toggleItem } from './compare-selection';

const STORAGE_KEY = 'product-finder.compare';

/**
 * The products picked for comparison. Session storage keeps them across a reload but not in a new tab;
 * the shareable state is the `/compare?sku=…` URL, not this selection.
 */
@Injectable({ providedIn: 'root' })
export class CompareStore {
  private readonly document = inject(DOCUMENT);
  private readonly selection = signal<readonly CompareItem[]>(
    parseStoredItems(this.withStorage((storage) => storage.getItem(STORAGE_KEY) ?? '[]', '[]')),
  );

  readonly items = this.selection.asReadonly();
  readonly skus = computed(() => this.selection().map((item) => item.sku));
  readonly full = computed(() => this.selection().length >= MAX_COMPARE);

  has(sku: string): boolean {
    return this.skus().includes(sku);
  }

  toggle(item: CompareItem): void {
    this.save(toggleItem(this.selection(), item));
  }

  remove(sku: string): void {
    this.save(this.selection().filter((item) => item.sku !== sku));
  }

  clear(): void {
    this.save([]);
  }

  private save(items: readonly CompareItem[]): void {
    this.selection.set(items);
    this.withStorage((storage) => storage.setItem(STORAGE_KEY, JSON.stringify(items)), undefined);
  }

  /** Storage can be blocked (SecurityError) or full (QuotaExceededError); the selection then lives in memory only. */
  private withStorage<T>(action: (storage: Storage) => T, fallback: T): T {
    try {
      const storage = this.document.defaultView?.sessionStorage;
      return storage ? action(storage) : fallback;
    } catch {
      return fallback;
    }
  }
}
