# Overtake

High-precision performance benchmarking library for Node.js with isolated worker thread execution and statistical convergence.

[![Build Status][github-image]][github-url]
[![NPM version][npm-image]][npm-url]
[![Downloads][downloads-image]][npm-url]

<!--[![Coverage Status][codecov-image]][codecov-url]-->
<!--[![Maintainability][codeclimate-image]][codeclimate-url]-->
<!--[![Snyk][snyk-image]][snyk-url]-->

## Table of Contents

- [Why Overtake?](#why-overtake)
- [Features](#features)
- [Installing](#installing)
- [Quick Start](#quick-start)
- [API Guide](#api-guide)
- [Examples](#examples)
- [CLI Usage](#cli-usage)
- [License](#license)

## Why Overtake?

Traditional JavaScript benchmarking tools often suffer from:

- **JIT optimization interference** - Code runs differently in benchmarks vs production
- **Memory pressure artifacts** - GC pauses and memory allocation affect timing
- **Cross-benchmark contamination** - Previous tests affect subsequent measurements
- **Insufficient sample sizes** - Results vary wildly between runs

Overtake solves these problems by:

- **Worker thread isolation** - Each benchmark runs in a separate thread with fresh V8 context
- **Statistical convergence** - Automatically runs until results are statistically stable
- **Zero-copy result collection** - Uses SharedArrayBuffer to eliminate serialization overhead
- **Proper warmup cycles** - Ensures JIT optimization before measurement
- **Concurrent execution** - Runs multiple benchmarks in parallel for faster results

## Features

- 🚀 **Worker thread isolation** for accurate measurements
- 📊 **Statistical convergence** with configurable confidence thresholds
- 🔄 **Automatic warmup cycles** to stabilize JIT optimization
- 💻 **TypeScript support** with transpilation built-in
- 🎯 **Multiple comparison targets** in a single benchmark
- 📈 **Rich statistics** including percentiles, mean, median, mode
- 🖥️ **CLI and programmatic API**
- ⚡ **Zero-copy communication** using SharedArrayBuffer

## Installing

Using pnpm:

```bash
$ pnpm add -D overtake
```

Using npm:

```bash
$ npm install -D overtake
```

## Quick Start

### Basic Benchmark

Compare different implementations of the same operation:

```typescript
// benchmark.ts
// npx overtake benchmark.ts
const suite = benchmark('1000 numbers', () => Array.from({ length: 1_000 }, (_, idx) => idx)).feed('10000 numbers', () => Array.from({ length: 10_000 }, (_, idx) => idx));

suite.target('for loop').measure('sum', (_, input) => {
  const n = input.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += input[i];
  }
  return sum;
});

suite.target('reduce').measure('sum', (_, input) => {
  return input.reduce((a, b) => a + b, 0);
});
```

### With Dynamic Imports (Required for External Modules)

```typescript
// crypto-benchmark.ts
// npx overtake crypto-benchmark.ts
const suite = benchmark('Hash 1MB data', () => Buffer.alloc(1_000_000));

// Dynamic import required for modules in worker threads
suite
  .target('crypto SHA256', async () => {
    const { createHash } = await import('node:crypto');
    return { createHash };
  })
  .measure('hash', ({ createHash }, input) => {
    createHash('sha256').update(input).digest();
  });
```

Run with CLI:

```bash
npx overtake benchmark.ts -f table
```

## API Guide

### Core Concepts

1. **Benchmark**: The main container for your performance tests
2. **Feed**: Different input data sets to test with
3. **Target**: Different implementations to compare (e.g., "for loop" vs "reduce")
4. **Measure**: Specific operations to measure for each target

### Creating Benchmarks

```typescript
// Create a benchmark with optional initial feed
const suite = benchmark('Test name', () => generateInputData());

// Add more input variations
suite.feed('small dataset', () => generateSmallData()).feed('large dataset', () => generateLargeData());

// Define implementations to compare
suite.target('implementation A').measure('operation', (ctx, input) => {
  // Your code here
});

suite.target('implementation B').measure('operation', (ctx, input) => {
  // Alternative implementation
});
```

### Dynamic Imports in Targets (Critical!)

**⚠️ IMPORTANT**: Since targets run in isolated worker threads, all module imports MUST be dynamic inside the target callback:

```typescript
// ✅ CORRECT - Dynamic import inside target
suite
  .target('V8 serialization', async () => {
    const { serialize, deserialize } = await import('node:v8');
    return { serialize, deserialize };
  })
  .measure('serialize', ({ serialize }, input) => {
    return serialize(input);
  });

// ❌ WRONG - Static import won't work in worker thread
import { serialize } from 'node:v8';
suite.target('V8', () => ({ serialize })); // This will fail!
```

### Setup and Teardown

```typescript
suite
  .target('with setup', async () => {
    // Setup: runs once before measurements
    // Remember: imports must be dynamic!
    const { createConnection } = await import('./db.js');
    const connection = await createConnection();
    return { connection };
  })
  .measure('query', async (ctx, input) => {
    // ctx contains the setup return value
    await ctx.connection.query(input);
  })
  .teardown(async (ctx) => {
    // Cleanup: runs once after measurements
    await ctx.connection.close();
  });
```

### Pre and Post Hooks

```typescript
suite
  .target('with hooks')
  .measure('process', (ctx, input) => {
    processData(input);
  })
  .pre((ctx, input) => {
    // Runs before EACH measurement
    prepareData(input);
  })
  .post((ctx, input) => {
    // Runs after EACH measurement
    cleanupData(input);
  });
```

## Examples

### Example 1: Serialization Comparison (Dynamic Imports)

This example shows the **critical pattern** of using dynamic imports for external modules:

```typescript
// serialization.ts
import { randomUUID } from 'node:crypto';

const suite = benchmark('10K strings', () => Array.from({ length: 10_000 }, () => randomUUID()));

// ✅ CORRECT: Dynamic import inside target callback
const v8Target = suite.target('V8', async () => {
  const { serialize, deserialize } = await import('node:v8');
  const gcBlock = new Set(); // Prevent GC during measurement
  return { serialize, deserialize, gcBlock };
});

v8Target.measure('serialize', ({ serialize, gcBlock }, input) => {
  gcBlock.add(serialize(input));
});

suite
  .target('JSON', () => {
    const gcBlock = new Set();
    return { gcBlock };
  })
  .measure('serialize', ({ gcBlock }, input) => {
    gcBlock.add(JSON.stringify(input));
  });
```

**Key patterns:**

- Dynamic imports (`await import()`) for modules needed in worker threads
- Setup function returns context for measure functions
- Using `gcBlock` Set to prevent garbage collection during measurements

### Example 2: Array Operations with Multiple Feeds

Compare different array copying methods across various data types:

```typescript
// array-copy.ts
const suite = benchmark('1M array of strings', () => Array.from({ length: 1_000_000 }, (_, idx) => `${idx}`))
  .feed('1M array of numbers', () => Array.from({ length: 1_000_000 }, (_, idx) => idx))
  .feed('1M typed array', () => new Uint32Array(1_000_000).map((_, idx) => idx));

suite.target('for loop').measure('copy half', (_, input) => {
  const n = input?.length ?? 0;
  const mid = n / 2;
  for (let i = 0; i < mid; i++) {
    input[i + mid] = input[i];
  }
});

suite.target('copyWithin').measure('copy half', (_, input) => {
  const n = input?.length ?? 0;
  const mid = n / 2;
  input.copyWithin(mid, 0, mid);
});
```

**Results insights:**

- `copyWithin` is ~5x faster for typed arrays
- Multiple feeds test performance across different data types
- Same measure name allows direct comparison

### Example 3: Object Merging Strategies

Compare five different approaches to merge arrays of objects:

```typescript
// object-merge.ts
import { Benchmark, printSimpleReports } from '../build/index.js';

const benchmark = new Benchmark('1K objects', () => Array.from({ length: 1_000 }, (_, idx) => ({ [idx]: idx })));

// Slowest: Creates new object each iteration
benchmark.target('reduce destructure').measure('data', (_, input) => {
  input.reduce((acc, obj) => ({ ...acc, ...obj }), {});
});

// Faster: Mutates accumulator
benchmark.target('reduce assign').measure('data', (_, input) => {
  input.reduce((acc, obj) => {
    Object.assign(acc, obj);
    return acc;
  }, {});
});

// Similar performance to reduce assign
benchmark.target('forEach assign').measure('data', (_, input) => {
  const result = {};
  input.forEach((obj) => Object.assign(result, obj));
});

// Classic for loop approach
benchmark.target('for assign').measure('data', (_, input) => {
  const result = {};
  for (let i = 0; i < input.length; i++) {
    Object.assign(result, input[i]);
  }
});

// Fastest: Single Object.assign call
benchmark.target('assign').measure('data', (_, input) => {
  Object.assign({}, ...input);
});

const reports = await benchmark.execute({
  reportTypes: ['ops'],
  maxCycles: 10_000,
});

printSimpleReports(reports);
```

**Performance ranking (fastest to slowest):**

1. `Object.assign({}, ...input)` - Single call, highly optimized
2. `for` loop with assign - Direct iteration
3. `forEach` with assign - Similar to for loop
4. `reduce` with assign - Functional but mutative
5. `reduce` with spread - Creates new object each iteration (50% slower)

## CLI Usage

### Basic Command

```bash
npx overtake <pattern> [options]
```

### Options

| Option               | Description                                                                                             | Default   |
| -------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| `-f, --format`       | Output format: `simple`, `table`, `json`, `pjson`                                                       | `simple`  |
| `-r, --report-types` | Statistics to display: `ops`, `mean`, `median`, `mode`, `min`, `max`, `p50`, `p75`, `p90`, `p95`, `p99` | `['ops']` |
| `-w, --workers`      | Number of concurrent worker threads                                                                     | CPU count |
| `--warmup-cycles`    | Number of warmup iterations before measurement                                                          | 20        |
| `--min-cycles`       | Minimum measurement cycles                                                                              | 50        |
| `--max-cycles`       | Maximum measurement cycles                                                                              | 1000      |
| `--abs-threshold`    | Absolute error threshold in nanoseconds                                                                 | 1000      |
| `--rel-threshold`    | Relative error threshold (0-1)                                                                          | 0.02      |

### Examples

```bash
# Run all benchmarks in a directory
npx overtake "src/**/*.bench.ts" -f table

# Show detailed statistics
npx overtake benchmark.ts -r ops mean median p95 p99

# Increase precision with more cycles
npx overtake benchmark.ts --min-cycles 100 --max-cycles 10000

# Output JSON for CI/CD integration
npx overtake benchmark.ts -f json > results.json
```

## License

License [Apache-2.0](http://www.apache.org/licenses/LICENSE-2.0)
Copyright (c) 2021-present Ivan Zakharchanka

[npm-url]: https://www.npmjs.com/package/overtake
[downloads-image]: https://img.shields.io/npm/dw/overtake.svg?maxAge=43200
[npm-image]: https://img.shields.io/npm/v/overtake.svg?maxAge=43200
[github-url]: https://github.com/3axap4eHko/overtake/actions/workflows/cicd.yml
[github-image]: https://github.com/3axap4eHko/overtake/actions/workflows/cicd.yml/badge.svg
[codecov-url]: https://codecov.io/gh/3axap4eHko/overtake
[codecov-image]: https://codecov.io/gh/3axap4eHko/overtake/branch/master/graph/badge.svg?token=JZ8QCGH6PI
[codeclimate-url]: https://codeclimate.com/github/3axap4eHko/overtake/maintainability
[codeclimate-image]: https://api.codeclimate.com/v1/badges/0ba20f27f6db2b0fec8c/maintainability
[snyk-url]: https://snyk.io/test/npm/overtake/latest
[snyk-image]: https://img.shields.io/snyk/vulnerabilities/github/3axap4eHko/overtake.svg?maxAge=43200
