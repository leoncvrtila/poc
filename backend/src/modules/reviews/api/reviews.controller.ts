import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ReviewPage, ReviewView } from '../domain/review';
import { ReviewsService } from '../reviews.service';
import { CreateReviewDto } from './create-review.dto';
import { ListReviewsQueryDto } from './list-reviews.query';

@ApiTags('reviews')
@Controller('products/:sku/reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@Param('sku') sku: string, @Query() query: ListReviewsQueryDto): Promise<ReviewPage> {
    return this.reviews.list(sku, query.page, query.pageSize);
  }

  /** The only write flow in the app: rate-limited per client IP because there is no authentication. */
  @Post()
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  create(@Param('sku') sku: string, @Body() body: CreateReviewDto): Promise<ReviewView> {
    return this.reviews.create(sku, body);
  }
}
