export default {
  verbose: true,
  testEnvironment: 'node',
  collectCoverage: !!process.env.CI,
  collectCoverageFrom: ['index.js', 'runner.js'],
  coveragePathIgnorePatterns: ['/node_modules/', '__fixtures__', '__mocks__', '__tests__'],
  coverageDirectory: './coverage',
  testMatch: ['**/__tests__/**/*.[jt]s?(x)'],
  transform: {},
};
