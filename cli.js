#!/usr/bin/env node

import { promisify } from 'util';
import glob from 'glob';
import { Overtake } from './index.js';
import { defaultReporter } from './reporter.js';

const globAsync = promisify(glob);
const pattern = process.argv[2] || '**/__benchmarks__/**/*.js';
const overtake = new Overtake({});

(async () => {
  const files = await globAsync(pattern);
  await overtake.load(files);
  if (overtake.reporters.length === 0) {
    reporter(defaultReporter);
  }
  await overtake.run();
})().catch((e) => console.error(e));
