import { Controller, Get, Query, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductSearchEngine, SearchUnavailableError } from '../domain/ports';
import type { ProductSearchResult } from '../domain/search-result';
import { SearchProductsQueryDto, toSearchQuery } from './search-products.query';

@ApiTags('search')
@Controller('products')
export class SearchController {
  constructor(private readonly engine: ProductSearchEngine) {}

  @Get()
  async search(@Query() query: SearchProductsQueryDto): Promise<ProductSearchResult> {
    try {
      return await this.engine.search(toSearchQuery(query));
    } catch (error) {
      if (error instanceof SearchUnavailableError) {
        // Product pages and reviews are served from Postgres and keep working.
        throw new ServiceUnavailableException('Search is temporarily unavailable');
      }
      throw error;
    }
  }
}
