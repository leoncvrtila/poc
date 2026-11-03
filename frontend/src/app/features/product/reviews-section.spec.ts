import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import type { Review, ReviewPage } from '../../core/api/api.models';
import { ProductsApi } from '../../core/api/products-api';
import { ReviewForm } from './review-form';
import { ReviewsSection } from './reviews-section';

function review(id: string): Review {
  return { id, authorName: `Author ${id}`, rating: 4, comment: `Comment ${id}`, createdAt: '2025-01-01T00:00:00Z' };
}

function page(pageNumber: number, ids: string[], total: number): ReviewPage {
  return {
    summary: { average: 4, count: total, distribution: { 1: 0, 2: 0, 3: 0, 4: total, 5: 0 } },
    items: ids.map(review),
    page: pageNumber,
    pageSize: 10,
    total,
  };
}

describe('ReviewsSection', () => {
  let api: { getReviews: jest.Mock; createReview: jest.Mock };
  let fixture: ComponentFixture<ReviewsSection>;

  const text = () => fixture.nativeElement.textContent as string;
  const flush = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const validReview = { authorName: 'Ana K.', rating: 4, comment: 'Works well in our pilot.' };

  beforeEach(async () => {
    api = {
      getReviews: jest.fn().mockReturnValue(of(page(1, ['a', 'b'], 2))),
      createReview: jest.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [ReviewsSection],
      providers: [{ provide: ProductsApi, useValue: api }, MessageService],
    }).compileComponents();
    fixture = TestBed.createComponent(ReviewsSection);
    fixture.componentRef.setInput('sku', 'P-10001');
    await flush();
  });

  it('loads the first page and shows the summary count', () => {
    expect(api.getReviews).toHaveBeenCalledWith('P-10001', 1, 10);
    expect(text()).toContain('2 reviews');
    expect(text()).toContain('Comment a');
    expect(text()).toContain('Comment b');
  });

  it('appends the next page on "show more"', async () => {
    api.getReviews.mockReturnValueOnce(of(page(1, ['a'], 2)));
    fixture.componentRef.setInput('sku', 'P-10002');
    await flush();
    expect(text()).toContain('Show more reviews');

    api.getReviews.mockReturnValue(of(page(2, ['b'], 2)));
    fixture.componentInstance.loadMore();
    await flush();

    expect(api.getReviews).toHaveBeenLastCalledWith('P-10002', 2, 10);
    expect(text()).toContain('Comment a');
    expect(text()).toContain('Comment b');
    expect(text()).not.toContain('Show more reviews');
  });

  it('shows the rate-limit message on 429', async () => {
    api.createReview.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));
    fixture.componentInstance.submit(validReview);
    await flush();
    expect(text()).toContain('You have submitted several reviews recently');
  });

  it('shows the closed-reviews message on 409', async () => {
    api.createReview.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    fixture.componentInstance.submit(validReview);
    await flush();
    expect(text()).toContain('reviews are closed');
  });

  it('shows the server message on a 409 duplicate', async () => {
    const error = { message: ['This review was already submitted.'] };
    api.createReview.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error })));
    fixture.componentInstance.submit(validReview);
    await flush();
    expect(text()).toContain('This review was already submitted.');
    expect(text()).not.toContain('reviews are closed');
  });

  it('shows the server message on a 400 such as links not allowed', async () => {
    const error = { message: ['Links are not allowed in reviews.'] };
    api.createReview.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error })));
    fixture.componentInstance.submit(validReview);
    await flush();
    expect(text()).toContain('Links are not allowed in reviews.');
  });

  it('still accepts a plain string message', async () => {
    const error = { message: 'Links are not allowed in reviews.' };
    api.createReview.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error })));
    fixture.componentInstance.submit(validReview);
    await flush();
    expect(text()).toContain('Links are not allowed in reviews.');
  });

  it('joins several validation messages with a space', async () => {
    const error = { message: ['comment too short', 'rating must be an integer'] };
    api.createReview.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error })));
    fixture.componentInstance.submit(validReview);
    await flush();
    expect(text()).toContain('comment too short rating must be an integer');
  });

  it.each([[[]], [[1, 'x']], [''], [[''] ], [undefined]])(
    'falls back to a generic 400 message for the unusable message %j',
    async (message) => {
      api.createReview.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 400, error: { message } })),
      );
      fixture.componentInstance.submit(validReview);
      await flush();
      expect(text()).toContain('Please check your input and try again.');
    },
  );

  it('does not show server text for other statuses', async () => {
    const error = { message: 'internal detail' };
    api.createReview.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500, error })));
    fixture.componentInstance.submit(validReview);
    await flush();
    expect(text()).toContain('Your review could not be saved.');
    expect(text()).not.toContain('internal detail');
  });

  it('clears the server error once the user edits the form', async () => {
    api.createReview.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 429 })));
    fixture.componentInstance.submit(validReview);
    await flush();

    const form = fixture.debugElement.query((el) => el.componentInstance instanceof ReviewForm).componentInstance as ReviewForm;
    form.form.controls.comment.setValue('Something else entirely');
    await flush();

    expect(text()).not.toContain('You have submitted several reviews recently');
  });

  it('resets the form and reloads after a successful submit', async () => {
    api.createReview.mockReturnValue(of(review('new')));
    const form = fixture.debugElement.query((el) => el.componentInstance instanceof ReviewForm).componentInstance as ReviewForm;
    form.form.setValue({ ...validReview, website: '' });
    const calls = api.getReviews.mock.calls.length;

    fixture.componentInstance.submit(validReview);
    await flush();

    expect(api.createReview).toHaveBeenCalledWith('P-10001', validReview);
    expect(form.form.getRawValue()).toEqual({ authorName: '', rating: 0, comment: '', website: '' });
    expect(api.getReviews.mock.calls.length).toBe(calls + 1);
  });
});
