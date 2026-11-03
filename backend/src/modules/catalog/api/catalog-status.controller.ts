import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogFacade, type CatalogStatus } from '../catalog.facade';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogStatusController {
  constructor(private readonly catalog: CatalogFacade) {}

  @Get('status')
  getStatus(): Promise<CatalogStatus> {
    return this.catalog.getStatus();
  }
}
