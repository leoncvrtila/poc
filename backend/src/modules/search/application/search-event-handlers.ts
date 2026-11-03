import { Injectable, OnModuleInit } from '@nestjs/common';
import { OutboxHandlerRegistry } from '../../../shared/outbox';
import { CATALOG_PRODUCTS_CHANGED, type ProductsChangedPayload } from '../../catalog';
import { type RatingChangedPayload, REVIEWS_RATING_CHANGED } from '../../reviews';
import { SearchIndexer } from './search-indexer.service';

@Injectable()
export class SearchEventHandlers implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly indexer: SearchIndexer,
  ) {}

  onModuleInit(): void {
    this.registry.register(CATALOG_PRODUCTS_CHANGED, (payload) =>
      this.indexer.syncProducts((payload as ProductsChangedPayload).skus),
    );
    this.registry.register(REVIEWS_RATING_CHANGED, (payload) =>
      this.indexer.syncProducts([(payload as RatingChangedPayload).sku]),
    );
  }
}
