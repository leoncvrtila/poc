import { deterministicUuid, demoReviewsFor } from './demo-reviews';

describe('deterministicUuid', () => {
  it('is stable and UUID-shaped', () => {
    const id = deterministicUuid('P-10001#0');
    expect(id).toBe(deterministicUuid('P-10001#0'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id).not.toBe(deterministicUuid('P-10001#1'));
  });
});

describe('demoReviewsFor', () => {
  it('generates the same reviews for the same SKU every time', () => {
    expect(demoReviewsFor('P-10001')).toEqual(demoReviewsFor('P-10001'));
  });

  it('generates 0–3 valid reviews', () => {
    for (const sku of ['P-10001', 'P-10002', 'P-10003', 'P-10004', 'P-10005']) {
      const reviews = demoReviewsFor(sku);
      expect(reviews.length).toBeLessThanOrEqual(3);
      for (const review of reviews) {
        expect(review.productSku).toBe(sku);
        expect(review.rating).toBeGreaterThanOrEqual(2);
        expect(review.rating).toBeLessThanOrEqual(5);
        expect(review.comment.length).toBeGreaterThanOrEqual(10);
      }
    }
  });
});
