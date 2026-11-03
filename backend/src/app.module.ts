import { Module } from '@nestjs/common';
import { CatalogModule } from './modules/catalog';
import { ReviewsModule } from './modules/reviews';
import { SearchModule } from './modules/search';
import { AppConfigModule } from './shared/config/app-config.module';
import { OutboxModule } from './shared/outbox';
import { PrismaModule } from './shared/prisma/prisma.module';

@Module({
  imports: [AppConfigModule, PrismaModule, OutboxModule, CatalogModule, ReviewsModule, SearchModule],
})
export class AppModule {}
