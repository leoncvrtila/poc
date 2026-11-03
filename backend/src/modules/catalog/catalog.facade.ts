import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { ProductView } from './domain/product';
import type { CatalogSearchCriteria, CatalogSearchPage } from './domain/product-search';
import { toProductView } from './product.mapper';
import { ProductSearchRepository } from './product-search.repository';

export interface CatalogStatus {
  lastImportAt: Date | null;
  listedProducts: number;
}

/** The only entry point other modules may use to read catalogue data. */
@Injectable()
export class CatalogFacade {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchRepository: ProductSearchRepository,
  ) {}

  async findBySku(sku: string): Promise<ProductView | null> {
    const product = await this.prisma.product.findUnique({ where: { sku } });
    return product ? toProductView(product) : null;
  }

  /** Listed or not. Unknown SKUs are omitted and results are not in input order; callers pass small lists (≤ 500). */
  async findBySkus(skus: string[]): Promise<ProductView[]> {
    if (skus.length === 0) {
      return [];
    }
    const products = await this.prisma.product.findMany({ where: { sku: { in: skus } } });
    return products.map(toProductView);
  }

  /** Postgres search over listed products; the fallback when the search engine is unavailable (no typo tolerance, simple ranking). */
  async searchProducts(criteria: CatalogSearchCriteria): Promise<CatalogSearchPage> {
    const [skus, total, facetCounts] = await Promise.all([
      this.searchRepository.pageSkus(criteria),
      this.searchRepository.count(criteria),
      this.searchRepository.facetCounts(criteria),
    ]);
    const bySku = new Map((await this.findBySkus(skus)).map((product) => [product.sku, product]));
    const items = skus.flatMap((sku) => bySku.get(sku) ?? []);
    return { items, total, facetCounts };
  }

  /** Keyset pagination over listed products in SKU order, so a full reindex never holds the catalogue in memory. */
  async *listedProducts(batchSize = 1000): AsyncGenerator<ProductView[]> {
    let after: string | undefined;
    for (;;) {
      const batch = await this.prisma.product.findMany({
        where: { listed: true, ...(after ? { sku: { gt: after } } : {}) },
        orderBy: { sku: 'asc' },
        take: batchSize,
      });
      if (batch.length > 0) {
        yield batch.map(toProductView);
      }
      if (batch.length < batchSize) {
        return;
      }
      after = batch[batch.length - 1].sku;
    }
  }

  async getStatus(): Promise<CatalogStatus> {
    const [lastRun, listedCount] = await Promise.all([
      this.prisma.importRun.findFirst({
        where: { outcome: 'SUCCEEDED' },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      }),
      this.prisma.product.count({ where: { listed: true } }),
    ]);
    return { lastImportAt: lastRun?.finishedAt ?? null, listedProducts: listedCount };
  }
}
