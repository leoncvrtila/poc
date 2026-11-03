/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'jest',
  jest: { projectType: 'custom', configFile: 'jest.config.cjs' },
  coverageAnalysis: 'perTest',
  mutate: [
    'src/app/features/search/search-query.ts',
    'src/app/features/product/status-banner.ts',
    'src/app/features/product/review-form.ts',
    'src/app/features/compare/compare-selection.ts',
    'src/app/features/compare/compare-table.ts',
  ],
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  thresholds: { high: 90, low: 80, break: 75 },
  tempDirName: '.stryker-tmp',
};
