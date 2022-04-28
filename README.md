# Overtake

Performance benchmark for NodeJS

[![Build Status][github-image]][github-url]
[![NPM version][npm-image]][npm-url]
[![Downloads][downloads-image]][npm-url]
[![Coverage Status][codecov-image]][codecov-url]
[![Maintainability][codeclimate-image]][codeclimate-url]
[![Snyk][snyk-image]][snyk-url]

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

Using yarn:

```bash
$ yarn add -D overtake
```

Using npm:

```bash
$ npm install -D overtake
```

## Examples

### Public interface

Create a benchmark in `__benchmarks__` folder

```javascript
benchmark('mongodb vs postgres', () => {
  // initialize a context for benchmark
  setup(async () => {
    const { Client } = await import('pg');
    const postgres = new Client();
    await postgres.connect();

    const { MongoClient } = await import('mongob');
    const mongo = new MongoClient(uri);
    await mongo.connect();

    return { postgres, mongo };
  });

  measure('mongodb inserts', ({ mongo } /* context */, next) => {
    // prepare a collection
    const database = mongo.db('overtake');
    const test = database.collection('test');

    return (data) => test.insertOne(data).then(next);
  });

  measure('postgres inserts', ({ postgres } /* context */, next) => {
    // prepare a query
    const query = 'INSERT INTO overtake(value) VALUES($1) RETURNING *';

    return (data) => postgres.query(query, [data.value]).then(next);
  });

  teardown(async ({ mongo, postgres }) => {
    await postgres.end();
    await mongo.end();
  });

  perform('simple test', 100000, [[{ value: 'test' }]]);
});
```

Make sure you have installed used modules and run

```bash
yarn overtake
```

or

```bash
npx overtake
```

### Inline support

```bash
npx overtake -i "class A{}" -i "function A() {}" -i "A = () => {};" -c 20000
```

```
⭐ Script
  ⇶ Suite
    ➤ Perform
      ✓ Measure class A{}
        ┌─────────┬──────────┬──────────┬──────────┬───────────┬───────┐
        │ (index) │   med    │   p95    │   p99    │   total   │ count │
        ├─────────┼──────────┼──────────┼──────────┼───────────┼───────┤
        │ 0.0005  │ 0.000551 │ 0.001493 │ 0.002344 │ 16.506385 │ 20000 │
        └─────────┴──────────┴──────────┴──────────┴───────────┴───────┘
      ✓ Measure function A() {}
        ┌─────────┬─────────┬────────┬──────────┬──────────┬───────┐
        │ (index) │   med   │  p95   │   p99    │  total   │ count │
        ├─────────┼─────────┼────────┼──────────┼──────────┼───────┤
        │ 0.00008 │ 0.00009 │ 0.0003 │ 0.000441 │ 2.875578 │ 20000 │
        └─────────┴─────────┴────────┴──────────┴──────────┴───────┘
      ✓ Measure A = () => {};
        ┌─────────┬─────────┬──────────┬──────────┬─────────┬───────┐
        │ (index) │   med   │   p95    │   p99    │  total  │ count │
        ├─────────┼─────────┼──────────┼──────────┼─────────┼───────┤
        │ 0.00008 │ 0.00012 │ 0.000331 │ 0.000601 │ 3.42556 │ 20000 │
        └─────────┴─────────┴──────────┴──────────┴─────────┴───────┘
```

Please take a look at [benchmarks](__benchmarks__) to see more examples

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
