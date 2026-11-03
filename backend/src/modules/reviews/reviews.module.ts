import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, type AppConfig } from '../../shared/config/app-config';
import { OutboxModule } from '../../shared/outbox';
import { CatalogModule } from '../catalog';
import { ReviewsController } from './api/reviews.controller';
import { DemoReviewsSeeder } from './demo/demo-reviews.seeder';
import { ReviewsFacade } from './reviews.facade';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    CatalogModule,
    OutboxModule,
    // ThrottlerModule is global: these options and the storage apply app-wide, not just to reviews.
    // Storage is in-memory per process, so N instances means N times the limit; scaling out needs a shared
    // store or nginx `limit_req`.
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [{ ttl: config.reviewRateLimit.ttlMs, limit: config.reviewRateLimit.limit }],
    }),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsFacade, DemoReviewsSeeder],
  exports: [ReviewsFacade, DemoReviewsSeeder],
})
export class ReviewsModule {}
