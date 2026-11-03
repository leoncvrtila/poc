import { containsLink, roundRating, summarizeRatings } from './review';

describe('roundRating', () => {
  it('rounds to one decimal and keeps null', () => {
    expect(roundRating(4.333)).toBe(4.3);
    expect(roundRating(4.25)).toBe(4.3);
    expect(roundRating(null)).toBeNull();
  });
});

describe('summarizeRatings', () => {
  it('builds average, count and a full 1–5 distribution', () => {
    expect(
      summarizeRatings([
        { rating: 5, count: 2 },
        { rating: 3, count: 1 },
      ]),
    ).toEqual({ average: 4.3, count: 3, distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 } });
  });

  it('returns an empty summary without reviews', () => {
    expect(summarizeRatings([])).toEqual({ average: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });
});

describe('containsLink', () => {
  it.each(['http://x.y', 'https://example.org/a', 'www.example', 'visit cheap-pills.ru', 'EXAMPLE.COM'])(
    'detects a link in %j',
    (text) => {
      expect(containsLink(text)).toBe(true);
    },
  );

  it.each(['pH 5.5', 'e.g. better than X', '2.5 kg per batch', 'U.S. market', 'Stable emulsions at low dosage.'])(
    'accepts %j',
    (text) => {
      expect(containsLink(text)).toBe(false);
    },
  );
});
