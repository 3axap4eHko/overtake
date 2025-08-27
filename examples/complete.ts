import { Benchmark, DEFAULT_REPORT_TYPES, printJSONReports } from '../build/index.js';
import { randomUUID, randomInt } from 'node:crypto';

const length = 10 ** 4;
// creates a benchmark suite with 3 data feeds of objects, strings and numbers
const suite = new Benchmark('1M array of objects', () =>
  Array.from({ length }, (_, idx) => ({
    string: randomUUID(),
    number: randomInt(length),
    boolean: idx % 3 === 0,
  })),
)
  .feed('1M array of strings', () => Array.from({ length }, () => randomUUID()))
  .feed('1M array of numbers', () => Array.from({ length }, () => randomInt(length)));

// create a specific benchmark target this way v8Target type is aware of
// serialize, deserialize and serialized properties inside the context
const v8Target = suite.target('v8', async () => {
  const { serialize, deserialize } = await import('node:v8');
  const serialized: Buffer = Buffer.from([]);
  return { serialize, deserialize, serialized };
});

v8Target
  .measure('serialize', ({ serialize }, input) => {
    serialize(input);
  })
  .pre(async (_ctx, _input) => {
    // executed before measurement
  })
  .post(async (_ctx, _input) => {
    // executed before measurement
  });

v8Target
  .measure('deserialize', ({ deserialize, serialized }) => {
    deserialize(serialized);
  })
  .pre(async (ctx, input) => {
    // since there is no serialized data pre hook prepares it
    // it serializes before each measurement
    ctx.serialized = ctx.serialize(input);
  })
  .post(async (ctx) => {
    // clean it up to avoid GC trigger during measurement
    ctx.serialized = undefined as unknown as Buffer;
  });

v8Target.teardown(async () => {
  // teardown the benchmark if needed free up resources, clean and etc
});

const jsonTarget = suite.target('json', () => {
  const { parse, stringify } = JSON;
  const serialized: string = '';
  return { parse, stringify, serialized };
});

jsonTarget
  .measure('stringify', ({ stringify }, input) => {
    stringify(input);
  })
  .pre(async (_ctx, _input) => {
    // executed before measurement
  })
  .post(async (_ctx, _input) => {
    // executed before measurement
  });

jsonTarget
  .measure('parsse', ({ parse, serialized }) => {
    parse(serialized);
  })
  .pre(async (ctx, input) => {
    ctx.serialized = ctx.stringify(input);
  })
  .post(async (ctx) => {
    ctx.serialized = '';
  });

jsonTarget.teardown(async () => {
  // teardown the benchmark if needed free up resources, clean and etc
});

const reports = await suite.execute({
  workers: 10,
  warmupCycles: 20,
  maxCycles: 100,
  minCycles: 100,
  absThreshold: 1_000,
  relThreshold: 0.02,
  reportTypes: DEFAULT_REPORT_TYPES,
});

printJSONReports(reports, 2);
