/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-preset-angular',
  // Explicit so Stryker's jest runner (which does not resolve the preset's value) uses jsdom too.
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '<rootDir>/.stryker-tmp/'],
  collectCoverageFrom: ['src/app/**/*.ts', '!src/app/**/*.spec.ts', '!src/app/app.config.ts', '!src/app/app.routes.ts'],
  coverageThreshold: { global: { lines: 85, branches: 75 } },
};
