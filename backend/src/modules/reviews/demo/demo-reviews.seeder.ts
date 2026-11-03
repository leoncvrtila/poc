import { Injectable } from '@nestjs/common';
import { OutboxPublisher } from '../../../shared/outbox';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CatalogFacade } from '../../catalog';
import { REVIEWS_RATING_CHANGED } from '../reviews.events';
import { demoReviewsFor } from './demo-reviews';

/** Demo data obeys the same rule as the catalogue seed: safe to run any number of times. */
@Injectable()
export class DemoReviewsSeeder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogFacade,
    private readonly outbox: OutboxPublisher,
  ) {}

  async seed(productLimit = 80): Promise<number> {
    const first = await this.catalog.listedProducts(productLimit).next();
    const products = first.done ? [] : first.value;
    const reviews = products.flatMap((product) => demoReviewsFor(product.sku));
    if (reviews.length === 0) {
      return 0;
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.review.createMany({ data: reviews, skipDuplicates: true });
      if (count > 0) {
        const skus = [...new Set(reviews.map((review) => review.productSku))];
        await this.outbox.publish(
          tx,
          skus.map((sku) => ({ type: REVIEWS_RATING_CHANGED, payload: { sku } })),
        );
      }
      return count;
    });
  }
}
