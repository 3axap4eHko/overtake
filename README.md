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
const suite = benchmark('Process 1000 items')
  .target('for loop')
  .measure('sum', (_, input) => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      sum += i;
    }
    return sum;
  });

suite.target('reduce').measure('sum', (_, input) => {
  return Array.from({ length: 1000 }, (_, i) => i).reduce((a, b) => a + b, 0);
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

### Setup and Teardown

```typescript
suite
  .target('with setup', async () => {
    // Setup: runs once before measurements
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

### Example 1: Array Operations Comparison

This example compares different methods for copying array elements:

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

**Key insights from results:**

- `copyWithin` is ~5x faster for typed arrays
- `for loop` performs consistently across all array types
- Regular arrays have different performance characteristics than typed arrays

### Example 2: Object Merging Strategies

Compare different approaches to merge arrays of objects:

```typescript
// object-merge.ts
import { Benchmark, printTableReports } from 'overtake';

const benchmark = new Benchmark('1K objects', () => Array.from({ length: 1_000 }, (_, idx) => ({ [idx]: idx })));

benchmark.target('spread operator').measure('merge', (_, input) => {
  return input.reduce((acc, obj) => ({ ...acc, ...obj }), {});
});

benchmark.target('Object.assign in reduce').measure('merge', (_, input) => {
  return input.reduce((acc, obj) => {
    Object.assign(acc, obj);
    return acc;
  }, {});
});

benchmark.target('Object.assign spread').measure('merge', (_, input) => {
  return Object.assign({}, ...input);
});

const reports = await benchmark.execute({
  reportTypes: ['ops', 'mean'],
  maxCycles: 10_000,
});

printTableReports(reports);
```

**Key insights:**

- Spread operator in reduce is ~50% slower due to object recreation
- `Object.assign` with spread is most concise and performant
- Mutating approaches (assign in reduce) offer similar performance

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
