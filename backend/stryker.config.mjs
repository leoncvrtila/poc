/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'jest',
  jest: { projectType: 'custom' }, // uses the "jest" block in package.json (unit tests only)
  coverageAnalysis: 'perTest',
  mutate: [
    'src/cli/synthetic-catalog.ts',
    'src/modules/catalog/import/csv-source.ts',
    'src/modules/catalog/import/normalize-row.ts',
    'src/modules/catalog/import/content-hash.ts',
    'src/modules/catalog/import/dedupe.ts',
    'src/modules/catalog/import/import-planner.ts',
    'src/modules/search/infrastructure/meili/meili-query.ts',
    'src/modules/search/application/facets.ts',
    'src/modules/search/application/resilient-product-search.ts',
    'src/modules/search/api/search-products.query.ts',
    'src/modules/reviews/domain/review.ts',
    'src/modules/reviews/api/create-review.dto.ts',
    'src/shared/outbox/outbox.types.ts',
  ],
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  thresholds: { high: 90, low: 80, break: 75 },
  tempDirName: '.stryker-tmp',
};
