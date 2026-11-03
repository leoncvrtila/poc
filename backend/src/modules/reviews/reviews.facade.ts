import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { type RatingSummary, roundRating } from './domain/review';

@Injectable()
export class ReviewsFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rating summaries keyed by SKU. SKUs without reviews are omitted; callers default to `{ average: null, count: 0 }`.
   * Pass batches of at most 1000 SKUs.
   */
  async getRatingSummaries(skus: string[]): Promise<Map<string, RatingSummary>> {
    if (skus.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.review.groupBy({
      by: ['productSku'],
      where: { productSku: { in: skus } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    return new Map(
      rows.map((row) => [row.productSku, { average: roundRating(row._avg.rating), count: row._count._all }]),
    );
  }
}
