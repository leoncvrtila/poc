import { createHash } from 'node:crypto';

export interface DemoReview {
  id: string;
  productSku: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

const AUTHORS = ['Ana K.', 'Marco R.', 'Priya S.', 'Lukas W.', 'Chen L.', 'Sofia M.'];
const COMMENTS: Record<number, string[]> = {
  5: [
    'Excellent batch-to-batch consistency; our formulation was stable from day one.',
    'Easy to process and the technical support answered within a day.',
  ],
  4: [
    'Performs well in our pilot, although we needed a slightly higher dosage than the datasheet suggests.',
    'Good performance overall; lead times could be shorter.',
  ],
  3: ['Works, but we had to adjust our process temperature to get stable results.'],
  2: ['Viscosity varied noticeably between the last two deliveries.'],
};
const RATINGS = [5, 4, 5, 3, 4, 2, 5, 4];
const BASE_DATE = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;

function digest(value: string): Buffer {
  return createHash('sha1').update(value).digest();
}

/** UUID v5-style id derived from a seed, so re-running the seed inserts nothing new. */
export function deterministicUuid(seed: string): string {
  const bytes = digest(seed).subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function demoReviewsFor(sku: string): DemoReview[] {
  const seed = digest(sku);
  const count = seed[0] % 4;
  return Array.from({ length: count }, (_, index) => {
    const rating = RATINGS[(seed[1] + index * 3) % RATINGS.length];
    const comments = COMMENTS[rating];
    return {
      id: deterministicUuid(`${sku}#${index}`),
      productSku: sku,
      authorName: AUTHORS[(seed[2] + index) % AUTHORS.length],
      rating,
      comment: comments[(seed[3] + index) % comments.length],
      createdAt: new Date(BASE_DATE + ((seed[4] + index * 17) % 300) * DAY_MS),
    };
  });
}
