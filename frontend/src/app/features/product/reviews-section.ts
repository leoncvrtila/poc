import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { finalize } from 'rxjs';
import type { NewReview, RatingSummary, Review, StarRating } from '../../core/api/api.models';
import { ProductsApi } from '../../core/api/products-api';
import { StarRatingView } from '../../shared/star-rating';
import { ReviewForm } from './review-form';

const PAGE_SIZE = 10;

/** The API sends `message` as a string, or as an array of strings (global ValidationPipe and our own rejections). */
function serverMessage(error: HttpErrorResponse): string | null {
  const message = (error.error as { message?: unknown } | null)?.message;
  const text = Array.isArray(message) && message.every((item) => typeof item === 'string') ? message.join(' ') : message;
  return typeof text === 'string' && text.length > 0 ? text : null;
}

function reviewErrorMessage(error: HttpErrorResponse): string {
  switch (error.status) {
    case 400:
      return serverMessage(error) ?? 'Please check your input and try again.';
    case 409:
      return serverMessage(error) ?? 'This product is no longer in the catalogue, so reviews are closed.';
    case 429:
      return 'You have submitted several reviews recently. Please try again later.';
    default:
      return 'Your review could not be saved. Please try again.';
  }
}

@Component({
  selector: 'app-reviews-section',
  imports: [DatePipe, ButtonModule, MessageModule, ProgressBarModule, StarRatingView, ReviewForm],
  template: `
    <section class="reviews" aria-labelledby="reviews-title">
      <h2 id="reviews-title">Customer reviews</h2>

      @if (summary(); as s) {
        @if (s.count > 0) {
          <div class="reviews__summary">
            <div class="reviews__score">
              <span class="reviews__average">{{ s.average }}</span>
              <app-star-rating [value]="s.average" />
              <span class="muted">{{ s.count }} {{ s.count === 1 ? 'review' : 'reviews' }}</span>
            </div>
            <ul class="reviews__distribution">
              @for (star of stars; track star) {
                <li>
                  <span>{{ star }} ★</span>
                  <p-progressbar [value]="percent(s, star)" [showValue]="false" />
                  <span class="muted">{{ s.distribution[star] }}</span>
                </li>
              }
            </ul>
          </div>
        } @else {
          <p class="muted">No reviews yet. Be the first to share your experience.</p>
        }
      }

      @if (canReview()) {
        <app-review-form [submitting]="submitting()" [serverError]="submitError()" (submitted)="submit($event)" (edited)="submitError.set(null)" />
      } @else {
        <p-message severity="secondary">New reviews are closed because this product is no longer in the catalogue.</p-message>
      }

      <ul class="reviews__list">
        @for (review of reviews(); track review.id) {
          <li class="review">
            <div class="review__header">
              <strong>{{ review.authorName }}</strong>
              <app-star-rating [value]="review.rating" />
              <time class="muted" [attr.datetime]="review.createdAt">{{ review.createdAt | date: 'mediumDate' }}</time>
            </div>
            <p class="review__comment">{{ review.comment }}</p>
          </li>
        }
      </ul>

      @if (loadError()) {
        <p-message severity="error">Reviews could not be loaded.</p-message>
      }
      @if (reviews().length < total()) {
        <p-button label="Show more reviews" severity="secondary" [text]="true" [loading]="loading()" (onClick)="loadMore()" />
      }
    </section>
  `,
  styles: `
    .reviews { display: grid; gap: 1rem; }
    h2 { margin: 0; }
    .reviews__summary { display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: center; }
    .reviews__score { display: grid; gap: 0.25rem; justify-items: start; }
    .reviews__average { font-size: 2rem; font-weight: 700; }
    .reviews__distribution { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; min-width: 220px; flex: 1; }
    .reviews__distribution li { display: grid; grid-template-columns: 2.5rem 1fr 2rem; gap: 0.5rem; align-items: center; }
    .reviews__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
    .review { padding: 1rem; border-radius: 0.75rem; background: var(--p-surface-0); border: 1px solid var(--p-surface-200); }
    .review__header { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; }
    .review__comment { margin: 0.5rem 0 0; white-space: pre-line; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewsSection {
  private readonly api = inject(ProductsApi);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly form = viewChild(ReviewForm);

  readonly sku = input.required<string>();
  readonly canReview = input(true);

  protected readonly stars: StarRating[] = [5, 4, 3, 2, 1];
  protected readonly reviews = signal<Review[]>([]);
  protected readonly summary = signal<RatingSummary | null>(null);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  constructor() {
    toObservable(this.sku)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.reload());
  }

  protected percent(summary: RatingSummary, star: StarRating): number {
    return summary.count === 0 ? 0 : Math.round((summary.distribution[star] / summary.count) * 100);
  }

  loadMore(): void {
    this.fetch(this.page() + 1, true);
  }

  submit(review: NewReview): void {
    this.submitting.set(true);
    this.submitError.set(null);
    this.api
      .createReview(this.sku(), review)
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.form()?.reset();
          this.messages.add({ severity: 'success', summary: 'Thank you!', detail: 'Your review is now visible to other customers.' });
          this.reload();
        },
        error: (error: HttpErrorResponse) => this.submitError.set(reviewErrorMessage(error)),
      });
  }

  private reload(): void {
    this.reviews.set([]);
    this.fetch(1, false);
  }

  private fetch(page: number, append: boolean): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.api
      .getReviews(this.sku(), page, PAGE_SIZE)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.summary.set(result.summary);
          this.total.set(result.total);
          this.page.set(result.page);
          this.reviews.set(append ? [...this.reviews(), ...result.items] : result.items);
        },
        error: () => this.loadError.set(true),
      });
  }
}
