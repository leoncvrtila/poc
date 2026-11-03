import { MAX_RESULT_WINDOW } from '../../domain/search-result';

/** Meilisearch serves at most this many hits per query, whatever `totalHits` reports. */
export const MAX_TOTAL_HITS = MAX_RESULT_WINDOW;

export const PRODUCT_INDEX_SETTINGS = {
  // Order = importance: a hit in the name beats a hit in the description.
  searchableAttributes: ['name', 'sku', 'chemicalName', 'function', 'applicationArea', 'certifications', 'description'],
  filterableAttributes: ['function', 'applicationArea', 'region', 'status', 'certifications'],
  sortableAttributes: ['displayName', 'launchYear', 'ratingAverage', 'reviewCount'],
  typoTolerance: {
    disableOnAttributes: ['sku'],
    // "SF 470" must not match "SF 471".
    disableOnNumbers: true,
  },
  pagination: { maxTotalHits: MAX_TOTAL_HITS },
  faceting: { maxValuesPerFacet: 100 },
};
