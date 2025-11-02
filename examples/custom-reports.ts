// Demonstrates custom report types and statistics
// CLI mode: npx overtake examples/custom-reports.ts -f table -r ops mean median p95 p99
// Programmatic mode: node examples/custom-reports.js

import { Benchmark, printTableReports } from '../build/index.js';

const performanceSuite = new Benchmark('10K numbers', () => Array.from({ length: 10_000 }, () => Math.random() * 1000));

// Compare different rounding methods
performanceSuite.target('rounding methods').measure('Math.floor', (_, numbers) => {
  for (const n of numbers) Math.floor(n);
});

// Execute with custom statistics
const reports = await performanceSuite.execute({
  workers: 4,
  minCycles: 100,
  maxCycles: 500,
  reportTypes: ['ops', 'mean', 'median', 'p50', 'p95', 'p99', 'min', 'max'] as const,
});

printTableReports(reports);
