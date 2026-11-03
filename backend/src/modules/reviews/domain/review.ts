export interface ReviewView {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export interface RatingSummaryWithDistribution extends RatingSummary {
  distribution: RatingDistribution;
}

export interface ReviewPage {
  summary: RatingSummaryWithDistribution;
  items: ReviewView[];
  page: number;
  pageSize: number;
  total: number;
}

export function roundRating(average: number | null): number | null {
  return average === null ? null : Math.round(average * 10) / 10;
}

export function summarizeRatings(groups: { rating: number; count: number }[]): RatingSummaryWithDistribution {
  const distribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let sum = 0;
  for (const group of groups) {
    distribution[group.rating as keyof RatingDistribution] = group.count;
    count += group.count;
    sum += group.rating * group.count;
  }
  return { average: count === 0 ? null : roundRating(sum / count), count, distribution };
}

/** URLs and bare domains with TLDs common in review spam; an explicit list keeps "pH 5.5" or "e.g." valid. */
const LINK_PATTERN =
  /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(?:com|net|org|info|biz|io|ru|cn|xyz|top|site|online|shop)\b)/i;

export function containsLink(text: string): boolean {
  return LINK_PATTERN.test(text);
}
