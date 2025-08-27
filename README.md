# Overtake

⚡ The fastest, most accurate JavaScript benchmarking library. Worker-isolated, statistically-rigorous, zero-overhead.

[![Build Status][github-image]][github-url]
[![NPM version][npm-image]][npm-url]
[![Downloads][downloads-image]][npm-url]

```bash
npm install -D overtake
```

## 5-Second Quick Start

```typescript
// benchmark.ts
const suite = benchmark('1M numbers', () => Array.from({ length: 1e6 }, (_, i) => i));

suite.target('for loop').measure('sum', (_, arr) => {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum;
});

suite.target('reduce').measure('sum', (_, arr) => arr.reduce((a, b) => a + b));
```

```bash
npx overtake benchmark.ts

# Output:
# for loop sum
#   1M numbers: 1,607 ops/s
#
# reduce sum
#   1M numbers: 238 ops/s (6.7x slower)
```

## Why Overtake?

**The Problem**: JavaScript benchmarks lie. JIT optimizations, garbage collection, and shared state make results meaningless.

**The Solution**: Overtake runs every benchmark in an isolated worker thread with a fresh V8 context. No contamination. No lies.

| Feature                 | Overtake                   | Benchmark.js      | Tinybench         |
| ----------------------- | -------------------------- | ----------------- | ----------------- |
| Worker isolation        | ✅ Each benchmark isolated | ❌ Shared context | ❌ Shared context |
| Active maintenance      | ✅ 2025                    | ❌ Archived 2017  | ✅ 2025           |
| Statistical convergence | ✅ Auto-adjusts cycles     | ⚠️ Manual config  | ⚠️ Manual config  |
| Zero-copy timing        | ✅ SharedArrayBuffer       | ❌ Serialization  | ❌ Serialization  |
| TypeScript support      | ✅ Built-in                | ❌ Manual setup   | ⚠️ Needs config   |

## Core Concepts

- **Feed**: Input data to benchmark (`'1M numbers'` → array of 1 million numbers)
- **Target**: Implementation variant (`'for loop'` vs `'reduce'`)
- **Measure**: Operation to time (`'sum'` operation)
- **Isolation**: Each benchmark runs in a separate worker thread with fresh V8 context

## Installation

```bash
# npm
npm install -D overtake

# pnpm
pnpm add -D overtake

# yarn
yarn add -D overtake
```

## ⚠️ Critical: Dynamic Imports Required

**Benchmarks run in isolated workers. Modules MUST be imported dynamically:**

```typescript
// ❌ WRONG - Static import won't work in worker
import { serialize } from 'node:v8';
benchmark('data', getData).target('v8', () => ({ serialize })); // serialize is undefined!

// ✅ CORRECT - Dynamic import inside target
benchmark('data', getData)
  .target('v8', async () => {
    const { serialize } = await import('node:v8');
    return { serialize };
  })
  .measure('serialize', ({ serialize }, input) => serialize(input));
```

## Usage

### CLI Mode (Recommended)

When using `npx overtake`, a global `benchmark` function is provided:

```typescript
// benchmark.ts - No imports needed!
benchmark('small', () => generateSmallData())
  .feed('large', () => generateLargeData())
  .target('algorithm A')
  .measure('process', (_, input) => processA(input))
  .target('algorithm B')
  .measure('process', (_, input) => processB(input));

// No .execute() needed - CLI handles it
```

```bash
npx overtake benchmark.ts --format table
```

### Programmatic Mode

For custom integration, import the Benchmark class:

```typescript
import { Benchmark, printTableReports } from 'overtake';

const suite = new Benchmark('dataset', () => getData());

suite.target('impl').measure('op', (_, input) => process(input));

// Must explicitly execute
const reports = await suite.execute({
  workers: 4,
  reportTypes: ['ops', 'mean', 'p95'],
});

printTableReports(reports);
```

## API Reference

### Creating Benchmarks

```typescript
// Create with initial feed
benchmark('initial data', () => data)
  .feed('more data', () => moreData) // Add more datasets

  // Define what to compare
  .target('implementation A')
  .measure('operation', (ctx, input) => {
    /* ... */
  })

  .target('implementation B')
  .measure('operation', (ctx, input) => {
    /* ... */
  });
```

### Targets with Setup

```typescript
const suite = benchmark('data', () => Buffer.from('test data'));

suite
  .target('with setup', async () => {
    // Setup runs once before measurements
    const { createHash } = await import('node:crypto');
    const cache = new Map();
    return { createHash, cache }; // Available as ctx in measure
  })
  .measure('hash', ({ createHash, cache }, input) => {
    // ctx contains setup return value
    const hash = createHash('sha256').update(input).digest();
    cache.set(input, hash);
    return hash;
  });
```

### Preventing Garbage Collection

```typescript
const suite = benchmark('data', () => [1, 2, 3, 4, 5]);

suite
  .target('no GC', () => {
    const gcBlock = new Set(); // Keeps references alive
    return { gcBlock };
  })
  .measure('process', ({ gcBlock }, input) => {
    const result = input.map((x) => x * x);
    gcBlock.add(result); // Prevent GC during measurement
    return result;
  });
```

## Examples

### Serialization Comparison

```typescript
// Compare V8 vs JSON serialization
const suite = benchmark('10K strings', () => Array.from({ length: 10_000 }, (_, i) => `string-${i}`));

suite
  .target('V8', async () => {
    const { serialize } = await import('node:v8');
    return { serialize };
  })
  .measure('serialize', ({ serialize }, input) => serialize(input));

suite.target('JSON').measure('serialize', (_, input) => JSON.stringify(input));
```

**[📁 More examples in `/examples`](./examples/)**

## CLI Options

```bash
npx overtake <pattern> [options]
```

| Option           | Short | Description                              | Default   |
| ---------------- | ----- | ---------------------------------------- | --------- |
| `--format`       | `-f`  | Output format: `simple`, `table`, `json` | `simple`  |
| `--report-types` | `-r`  | Stats to show: `ops`, `mean`, `p95`, etc | `['ops']` |
| `--workers`      | `-w`  | Concurrent workers                       | CPU count |
| `--min-cycles`   |       | Minimum iterations                       | 50        |
| `--max-cycles`   |       | Maximum iterations                       | 1000      |

### Example Commands

```bash
# Run all benchmarks with table output
npx overtake "**/*.bench.ts" -f table

# Show detailed statistics
npx overtake bench.ts -r ops mean p95 p99

# Output JSON for CI
npx overtake bench.ts -f json > results.json
```

## Troubleshooting

### "Cannot find module" in worker

**Solution**: Use dynamic imports inside target callbacks (see [Critical section](#️-critical-dynamic-imports-required))

### No output from benchmark

**Solution**: In CLI mode, don't import Benchmark or call `.execute()`. Use the global `benchmark` function.

### Results vary between runs

**Solution**: Increase `--min-cycles` for more samples, or use the `gcBlock` pattern to prevent garbage collection.

**[🐛 Report issues](https://github.com/3axap4eHko/overtake/issues)**

## License

[Apache-2.0](http://www.apache.org/licenses/LICENSE-2.0) © 2021-2025 Ivan Zakharchanka

[npm-url]: https://www.npmjs.com/package/overtake
[downloads-image]: https://img.shields.io/npm/dw/overtake.svg?maxAge=43200
[npm-image]: https://img.shields.io/npm/v/overtake.svg?maxAge=43200
[github-url]: https://github.com/3axap4eHko/overtake/actions/workflows/cicd.yml
[github-image]: https://github.com/3axap4eHko/overtake/actions/workflows/cicd.yml/badge.svg
