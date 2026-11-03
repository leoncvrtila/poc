import { Module } from '@nestjs/common';
import { OutboxModule } from '../../shared/outbox';
import { CatalogStatusController } from './api/catalog-status.controller';
import { ProductController } from './api/product.controller';
import { CatalogFacade } from './catalog.facade';
import { CatalogImportService } from './import/catalog-import.service';
import { ProductSearchRepository } from './product-search.repository';

@Module({
  imports: [OutboxModule],
  controllers: [ProductController, CatalogStatusController],
  providers: [CatalogFacade, CatalogImportService, ProductSearchRepository],
  exports: [CatalogFacade, CatalogImportService],
})
export class CatalogModule {}
