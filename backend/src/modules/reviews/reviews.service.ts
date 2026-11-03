import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Review } from '../../generated/prisma/client';
import { OutboxPublisher } from '../../shared/outbox';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CatalogFacade, type ProductView } from '../catalog';
import { type ReviewPage, type ReviewView, summarizeRatings } from './domain/review';
import { REVIEWS_RATING_CHANGED, type RatingChangedPayload } from './reviews.events';

/** The same author posting the same comment on the same product within this window counts as a resubmission. */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60_000;

/** Same normalisation as the SQL side: lower-case, collapsed whitespace. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface CreateReviewInput {
  authorName: string;
  rating: number;
  comment: string;
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogFacade,
    private readonly outbox: OutboxPublisher,
  ) {}

  async list(sku: string, page: number, pageSize: number): Promise<ReviewPage> {
    await this.requireProduct(sku);
    const [items, groups] = await Promise.all([
      this.prisma.review.findMany({
        where: { productSku: sku },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.review.groupBy({ by: ['rating'], where: { productSku: sku }, _count: { _all: true } }),
    ]);
    const summary = summarizeRatings(groups.map((group) => ({ rating: group.rating, count: group._count._all })));
    return { summary, items: items.map(toReviewView), page, pageSize, total: summary.count };
  }

  async create(sku: string, input: CreateReviewInput): Promise<ReviewView> {
    // The "listed" check is a UX rule, not a DB invariant: no lock spans the module boundary, and products are never deleted.
    const product = await this.requireProduct(sku);
    if (!product.listed) {
      throw new ConflictException('This product is no longer in the catalogue, so it cannot be reviewed');
    }
    const review = await this.prisma.$transaction(async (tx) => {
      // Bound parameters only; `=` instead of ILIKE so that `%` and `_` in a comment are never wildcards.
      const duplicates = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM review
        WHERE product_sku = ${sku}
          AND created_at >= ${new Date(Date.now() - DUPLICATE_WINDOW_MS)}
          AND lower(regexp_replace(comment, '\\s+', ' ', 'g')) = ${normalize(input.comment)}
          AND lower(regexp_replace(author_name, '\\s+', ' ', 'g')) = ${normalize(input.authorName)}
        LIMIT 1`;
      if (duplicates.length > 0) {
        throw new ConflictException('This review was already submitted.');
      }
      const created = await tx.review.create({
        data: { productSku: sku, authorName: input.authorName, rating: input.rating, comment: input.comment },
      });
      await this.outbox.publish(tx, [
        { type: REVIEWS_RATING_CHANGED, payload: { sku } satisfies RatingChangedPayload },
      ]);
      return created;
    });
    return toReviewView(review);
  }

  /** Operator removal; returns the SKU of the removed review, or null when the id is not a known review. */
  async remove(id: string): Promise<string | null> {
    if (!isUUID(id)) {
      return null;
    }
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.findUnique({ where: { id }, select: { productSku: true } });
      if (!review) {
        return null;
      }
      // deleteMany instead of delete: a concurrent removal yields count 0 rather than a P2025 error.
      const { count } = await tx.review.deleteMany({ where: { id } });
      if (count === 0) {
        return null;
      }
      await this.outbox.publish(tx, [
        { type: REVIEWS_RATING_CHANGED, payload: { sku: review.productSku } satisfies RatingChangedPayload },
      ]);
      return review.productSku;
    });
  }

  private async requireProduct(sku: string): Promise<ProductView> {
    const product = await this.catalog.findBySku(sku);
    if (!product) {
      throw new NotFoundException(`Product ${sku} not found`);
    }
    return product;
  }
}

function toReviewView(review: Review): ReviewView {
  return {
    id: review.id,
    authorName: review.authorName,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  };
}
