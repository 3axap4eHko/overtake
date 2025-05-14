export default {
  verbose: true,
  collectCoverage: !!process.env.CI,
  collectCoverageFrom: ['index.js', 'runner.js'],
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/coverage', '/node_modules/', '__tests__'],
  coverageDirectory: './coverage',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '\\.js$': '@swc/jest',
  },
  testMatch: ['**/__tests__/**/*.js'],
};
