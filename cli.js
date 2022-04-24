#!/usr/bin/env node
import Path from 'path';
import glob from 'glob';
import { benchmark, setup, teardown, measure, perform, suites, runner } from './index.js';

const pattern = process.argv[2] || '**/__benchmarks__/**/*.js';

Object.assign(globalThis, {
  benchmark,
  setup,
  teardown,
  measure,
  perform,
});

glob(pattern, async (err, files) => {
  try {
    for (const file of files) {
      const filepath = Path.resolve(file);
      await import(filepath);
    }
  } catch (e) {
    console.error(e.stack);
  }
  for (const suite of suites) {
    await runner(suite);
  }
});
