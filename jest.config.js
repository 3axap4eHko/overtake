export default {
  verbose: true,
  collectCoverage: !!process.env.CI,
  collectCoverageFrom: ['index.js', 'runner.js'],
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/coverage', '/node_modules/', '__tests__'],
  coverageDirectory: './coverage',
  transform: {},
  testMatch: ['**/__tests__/**/*.js'],
};
