#!/usr/bin/env node

import { promisify } from 'util';
import Path from 'path';
import glob from 'glob';
import { load, benchmark, setup, teardown, measure, perform, run, defaultReporter } from './index.js';

const globAsync = promisify(glob);
const pattern = process.argv[2] || '**/__benchmarks__/**/*.js';

Object.assign(globalThis, { benchmark, setup, teardown, measure, perform });

(async () => {
  const files = await globAsync(pattern);
  const scripts = [];
  for (const file of files) {
    const filename = Path.resolve(file);
    const script = await load(filename);
    scripts.push(script);
  }

  await run(scripts, defaultReporter);
})().catch((e) => console.error(e));
