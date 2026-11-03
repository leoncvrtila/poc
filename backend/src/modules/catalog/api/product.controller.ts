import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogFacade } from '../catalog.facade';
import type { ProductView } from '../domain/product';

@ApiTags('catalog')
@Controller('products')
export class ProductController {
  constructor(private readonly catalog: CatalogFacade) {}

  /** Returns delisted and discontinued products too, so old shared links keep working. */
  @Get(':sku')
  async getProduct(@Param('sku') sku: string): Promise<ProductView> {
    const product = await this.catalog.findBySku(sku);
    if (!product) {
      throw new NotFoundException(`Product ${sku} not found`);
    }
    return product;
  }
}
