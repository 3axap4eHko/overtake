# Overtake

Performance benchmark for NodeJS

[![Build Status][github-image]][github-url]
[![NPM version][npm-image]][npm-url]
[![Downloads][downloads-image]][npm-url]

<!--[![Coverage Status][codecov-image]][codecov-url]-->
<!--[![Maintainability][codeclimate-image]][codeclimate-url]-->
<!--[![Snyk][snyk-image]][snyk-url]-->

## Table of Contents

- [Features](#features)
- [Installing](#installing)
- [Examples](#examples)
- [License](#license)

## Features

- CLI
- TypeScript support
- Running in thread worker

## Installing

Using pnpm:

```bash
$ pnpm add -D overtake
```

Using npm:

```bash
$ npm install -D overtake
```

## Examples

### From command line

Create a benchmark file

```typescript
// src/__bench__/array-copy.ts
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

Run the command

```bash
npx overtake src/__bench__/array-copy.ts -f table -r ops mode mean p99
```

```
 for loop copy half
┌─────────────────────┬──────────────────────┬─────────────┬─────────────┬─────────────────────┬────────┐
│ (index)             │ ops                  │ mode        │ mean        │ p99                 │ count  │
├─────────────────────┼──────────────────────┼─────────────┼─────────────┼─────────────────────┼────────┤
│ 1M typed array      │ '3698 ops/s ± 0.81%' │ '256.65 µs' │ '270.38 µs' │ '574.7 µs ± 0.19%'  │ '1000' │
│ 1M array of numbers │ '2902 ops/s ± 0.3%'  │ '343.92 µs' │ '344.51 µs' │ '429.24 µs ± 0.2%'  │ '1000' │
│ 1M array of strings │ '2277 ops/s ± 0.46%' │ '397.15 µs' │ '438.99 µs' │ '569.15 µs ± 0.12%' │ '1000' │
└─────────────────────┴──────────────────────┴─────────────┴─────────────┴─────────────────────┴────────┘

 copyWithin copy half
┌─────────────────────┬───────────────────────┬────────────┬────────────┬────────────────────┬────────┐
│ (index)             │ ops                   │ mode       │ mean       │ p99                │ count  │
├─────────────────────┼───────────────────────┼────────────┼────────────┼────────────────────┼────────┤
│ 1M typed array      │ '17454 ops/s ± 0.67%' │ '53.11 µs' │ '57.29 µs' │ '81.18 µs ± 1.54%' │ '1000' │
│ 1M array of numbers │ '103 ops/s ± 0.02%'   │ '9.49 ms'  │ '9.64 ms'  │ '9.91 ms ± 0.38%'  │ '50'   │
│ 1M array of strings │ '101 ops/s ± 0.06%'   │ '9.55 ms'  │ '9.87 ms'  │ '10.87 ms ± 2.67%' │ '98'   │
└─────────────────────┴───────────────────────┴────────────┴────────────┴────────────────────┴────────┘
```

### From a standalone module

Create a benchmark file

```typescript
// src/__bench__/array-copy.js
import { Benchmark, printTableReports } from 'overtake';

const benchmark = Benchmark.create('1M array of strings', () => Array.from({ length: 1_000_000 }, (_, idx) => `${idx}`))
  .feed('1M array of numbers', () => Array.from({ length: 1_000_000 }, (_, idx) => idx))
  .feed('1M typed array', () => new Uint32Array(1_000_000).map((_, idx) => idx));

benchmark.target('for loop').measure('copy half', (_, input) => {
  const n = input?.length ?? 0;
  const mid = n / 2;
  for (let i = 0; i < mid; i++) {
    input[i + mid] = input[i];
  }
});

benchmark.target('copyWithin').measure('copy half', (_, input) => {
  const n = input?.length ?? 0;
  const mid = n / 2;
  input.copyWithin(mid, 0, mid);
});

const reports = await benchmark.execute({
  reportTypes: ['ops', 'mode', 'mean', 'p99'],
});

printTableReports(reports);
```

And run the command

```bash
node src/__bench__/array-copy.js
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
