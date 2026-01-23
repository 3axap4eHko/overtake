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
});

suite.target('reduce').measure('sum', (_, arr) => {
  arr.reduce((a, b) => a + b);
});
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

| Feature                   | Overtake                     | Benchmark.js      | Tinybench         |
| ------------------------- | ---------------------------- | ----------------- | ----------------- |
| Worker isolation          | ✅ Each benchmark isolated   | ❌ Shared context | ❌ Shared context |
| GC interference detection | ✅ Discards affected samples | ❌                | ❌                |
| Outlier filtering         | ✅ IQR-based automatic       | ❌                | ❌                |
| Adaptive batch sizing     | ✅ Auto-tuned                | ❌                | ❌                |
| Statistical convergence   | ✅ Auto-adjusts cycles       | ⚠️ Manual config  | ⚠️ Manual config  |
| Memory tracking           | ✅ heapUsedKB                | ❌                | ❌                |
| DCE detection             | ✅ Warning                   | ❌                | ❌                |
| Baseline comparison       | ✅ CLI flag                  | ❌                | ❌                |
| Progress bar              | ✅ --progress                | ❌                | ❌                |
| Zero-copy timing          | ✅ SharedArrayBuffer         | ❌ Serialization  | ❌ Serialization  |
| TypeScript support        | ✅ Built-in                  | ❌ Manual setup   | ⚠️ Needs config   |
| Active maintenance        | ✅ 2025                      | ❌ Archived 2017  | ✅ 2025           |

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

## ⚠️ Critical: Capture-Free Functions Required

Functions you pass to `target/measure/setup/pre/post` are stringified and re-evaluated in a worker. Anything they close over (including statically imported bindings) is **not** available. Pull dependencies inside the function body—typically with `await import(...)`.

```typescript
// ❌ WRONG: closes over serialize; it is undefined in the worker
import { serialize } from 'node:v8';
benchmark('data', getData).target('v8', () => ({ serialize }));

// ✅ CORRECT: import inside the worker-run function
benchmark('data', getData)
  .target('v8', async () => {
    const { serialize } = await import('node:v8');
    return { serialize };
  })
  .measure('serialize', ({ serialize }, input) => serialize(input));
```

### Importing Local Files

- **CLI mode (`npx overtake`)**: `baseUrl` is set to the benchmark file, so `await import('./helper.js')` works.
- **Programmatic mode (`suite.execute`)**: pass `baseUrl: import.meta.url` (the benchmark’s file URL) so relative imports resolve correctly. If you omit it, Overtake falls back to `process.cwd()` and relative imports may fail.

```typescript
// CLI usage – relative path is fine
benchmark('local', () => 1)
  .target('helper', async () => {
    const { helper } = await import('./helpers.js');
    return { helper };
  })
  .measure('use helper', ({ helper }) => helper());

// Programmatic usage – provide baseUrl
const suite = new Benchmark('local');
suite.target('helper', async () => {
  const { helper } = await import('./helpers.js');
  return { helper };
});
await suite.execute({ baseUrl: import.meta.url });
```

## Usage

### CLI Mode (Recommended)

When using `npx overtake`, a global `benchmark` function is provided:

```typescript
// benchmark.ts - No imports needed!
benchmark('small', () => generateSmallData())
  .feed('large', () => generateLargeData())
  .target('algorithm A')
  .measure('process', (_, input) => {
    processA(input);
  })
  .target('algorithm B')
  .measure('process', (_, input) => {
    processB(input);
  });
```

```bash
npx overtake benchmark.ts --format table
```

### Programmatic Mode

For custom integration, import the Benchmark class:

```typescript
import { Benchmark, printTableReports } from 'overtake';

const suite = new Benchmark('dataset', () => getData());

suite.target('impl').measure('op', (_, input) => {
  process(input);
});

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
  });
```

## Examples

### Compare Algorithms

```typescript
// examples/quick-start.ts
const sumBenchmark = benchmark('1M numbers', () => Array.from({ length: 1_000_000 }, (_, i) => i));

sumBenchmark.target('for loop').measure('sum', (_, numbers) => {
  let sum = 0;
  for (let i = 0; i < numbers.length; i++) sum += numbers[i];
});

sumBenchmark.target('reduce').measure('sum', (_, numbers) => {
  numbers.reduce((a, b) => a + b, 0);
});
```

### Import Local Modules

```typescript
// examples/imports.ts - Correct way to import local files
.target('local files', async () => {
  const { join } = await import('node:path');
  const modulePath = join(process.cwd(), './build/myModule.js');
  const { myFunction } = await import(modulePath);
  return { myFunction };
})
```

**[📁 See all examples](./examples/):**

- `quick-start.ts` - Minimal benchmark example
- `complete.ts` - All features (setup/teardown, pre/post hooks, multiple feeds)
- `imports.ts` - Import patterns and memory management
- `custom-reports.ts` - Statistics and custom report types

## CLI Options

```bash
npx overtake <pattern> [options]
```

| Option               | Short | Description                                           | Default   |
| -------------------- | ----- | ----------------------------------------------------- | --------- |
| `--format`           | `-f`  | Output format (see [Output Formats](#output-formats)) | `simple`  |
| `--report-types`     | `-r`  | Stats to show (see [Metrics](#available-metrics))     | `['ops']` |
| `--workers`          | `-w`  | Concurrent workers                                    | CPU count |
| `--min-cycles`       |       | Minimum measurement iterations                        | 50        |
| `--max-cycles`       |       | Maximum measurement iterations                        | 1000      |
| `--warmup-cycles`    |       | Warmup iterations before measuring                    | 20        |
| `--abs-threshold`    |       | Absolute error threshold (nanoseconds)                | 1000      |
| `--rel-threshold`    |       | Relative error threshold (0-1)                        | 0.02      |
| `--no-gc-observer`   |       | Disable GC overlap detection                          | enabled   |
| `--progress`         |       | Show progress bar during execution                    | disabled  |
| `--save-baseline`    |       | Save results to baseline file                         | -         |
| `--compare-baseline` |       | Compare against baseline file                         | -         |

### Example Commands

```bash
# Run all benchmarks with table output
npx overtake "**/*.bench.ts" -f table

# Show detailed statistics
npx overtake bench.ts -r ops mean p95 p99

# Output JSON for CI
npx overtake bench.ts -f json > results.json

# Show progress bar for long benchmarks
npx overtake bench.ts --progress

# Markdown output for docs/PRs
npx overtake bench.ts -f markdown

# ASCII histogram chart
npx overtake bench.ts -f histogram
```

## Output Formats

| Format      | Description                      |
| ----------- | -------------------------------- |
| `simple`    | Grouped console output (default) |
| `table`     | Console table format             |
| `json`      | Compact JSON                     |
| `pjson`     | Pretty-printed JSON              |
| `markdown`  | Markdown table for docs/PRs      |
| `histogram` | ASCII bar chart comparing ops/s  |

**Markdown example:**

```bash
npx overtake bench.ts -f markdown
```

```markdown
## for loop - sum

| Feed       | ops                   |
| ---------- | --------------------- |
| 1M numbers | 2,189 ops/s +/- 0.17% |
```

**Histogram example:**

```bash
npx overtake bench.ts -f histogram
```

```
for loop - sum

  1M numbers | ████████████████████████████████████████ 2,189 ops/s

reduce - sum

  1M numbers | ████ 233 ops/s
```

## Available Metrics

Specify with `--report-types` or `reportTypes` option.

### Core Metrics

| Metric        | Description                     |
| ------------- | ------------------------------- |
| `ops`         | Operations per second (default) |
| `mean`        | Average duration                |
| `median`      | Middle value (p50)              |
| `min` / `max` | Range bounds                    |
| `mode`        | Most frequent duration          |

### Dispersion Metrics

| Metric     | Description               |
| ---------- | ------------------------- |
| `sd`       | Standard deviation        |
| `variance` | Statistical variance      |
| `sem`      | Standard error of mean    |
| `mad`      | Median absolute deviation |
| `iqr`      | Interquartile range       |

### Confidence Metrics

| Metric     | Description                  |
| ---------- | ---------------------------- |
| `moe`      | Margin of error (95% CI)     |
| `rme`      | Relative margin of error (%) |
| `ci_lower` | Lower bound of 95% CI        |
| `ci_upper` | Upper bound of 95% CI        |

### Percentiles

`p1` through `p99` - any percentile

**Example:**

```bash
npx overtake bench.ts -r ops mean sd rme p50 p95 p99
```

## Baseline Comparison

Track performance regressions by saving and comparing baselines:

```bash
# Save current results as baseline
npx overtake bench.ts --save-baseline baseline.json

# Later, compare against baseline
npx overtake bench.ts --compare-baseline baseline.json
```

**Output shows:**

- `+` Green: Performance improved (>5% better)
- `!` Red: Performance regressed (>5% worse)
- No indicator: Within threshold

**CI usage:**

```bash
# In CI, fail if regression detected
npx overtake bench.ts --compare-baseline main-baseline.json
```

## Additional Output Information

### Memory Tracking

Each benchmark reports heap memory delta:

```
1M numbers ops: 233 ops/s +/- 0.13% (heap: 1794KB)
```

This indicates memory allocated during the benchmark run.

### DCE Warning

If you see `[DCE warning]`, V8 may have eliminated your benchmark code:

```
1M numbers ops: 5,000,000,000 ops/s [DCE warning]
```

**Solutions:**

1. Ensure your function returns a value
2. Use the provided input data
3. Have observable side effects

The benchmark internally uses atomic operations to prevent DCE, but extremely simple operations may still trigger this warning.

## Advanced Configuration

### Environment Variables

| Variable                   | Description                               |
| -------------------------- | ----------------------------------------- |
| `OVERTAKE_PERTURB_INPUT=1` | Add nonce to inputs (defeats JIT caching) |

### Node.js Flags

The CLI automatically enables these flags:

- `--experimental-vm-modules` - Required for worker isolation
- `--expose-gc` - Enables explicit GC between samples
- `--no-warnings` - Suppresses experimental warnings

### Programmatic Options

```typescript
const reports = await suite.execute({
  workers: 4, // Concurrent workers
  warmupCycles: 20, // Warmup iterations
  minCycles: 50, // Minimum measurement iterations
  maxCycles: 1000, // Maximum measurement iterations
  absThreshold: 1_000, // Stop if stddev < 1us
  relThreshold: 0.02, // Stop if CoV < 2%
  gcObserver: true, // Discard GC-affected samples
  reportTypes: ['ops', 'mean', 'p95'],
  progress: true, // Show progress bar
  progressInterval: 100, // Progress update interval (ms)
});
```

### One Benchmark Per File

CLI mode enforces one benchmark per file. Calling `benchmark()` twice throws an error. For multiple benchmarks, use separate files or programmatic mode.

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
