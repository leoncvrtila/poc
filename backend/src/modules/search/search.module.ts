import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/app-config';
import { OutboxModule } from '../../shared/outbox';
import { CatalogModule } from '../catalog';
import { ReviewsModule } from '../reviews';
import { SearchController } from './api/search.controller';
import { SearchEventHandlers } from './application/search-event-handlers';
import { SearchIndexBootstrap } from './application/search-index.bootstrap';
import { ResilientProductSearch } from './application/resilient-product-search';
import { SearchIndexer } from './application/search-indexer.service';
import { ProductIndexWriter, ProductSearchEngine } from './domain/ports';
import { CatalogBackedSearch } from './infrastructure/postgres/catalog-backed-search';
import { MeiliClient } from './infrastructure/meili/meili-client';
import { MeiliProductIndex } from './infrastructure/meili/meili-product-index';
import { MeiliProductSearch } from './infrastructure/meili/meili-product-search';
import { MEILI_INDEX } from './search.tokens';

@Module({
  imports: [CatalogModule, ReviewsModule, OutboxModule],
  controllers: [SearchController],
  providers: [
    {
      provide: MeiliClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new MeiliClient(config.meili.url, config.meili.apiKey),
    },
    { provide: MEILI_INDEX, inject: [APP_CONFIG], useFactory: (config: AppConfig) => config.meili.index },
    MeiliProductSearch,
    CatalogBackedSearch,
    {
      provide: ProductSearchEngine,
      inject: [MeiliProductSearch, CatalogBackedSearch],
      useFactory: (primary: MeiliProductSearch, fallback: CatalogBackedSearch) =>
        new ResilientProductSearch(primary, fallback),
    },
    { provide: ProductIndexWriter, useClass: MeiliProductIndex },
    SearchIndexer,
    SearchEventHandlers,
    SearchIndexBootstrap,
  ],
  exports: [SearchIndexer],
})
export class SearchModule {}
