import WorkerThreads from 'node:worker_threads';
import pkg from 'conode';
const { createContext } = pkg;

const overtakeContext = createContext();
const suiteContext = createContext();

export const NOOP = () => {};

export const allowedFields = [
  'mode',
  'med',
  'p1',
  'p5',
  'p10',
  'p20',
  'p33',
  'p50',
  'p66',
  'p80',
  'p90',
  'p95',
  'p99',
  'min',
  'max',
  'avg',
  'sum',
  'count',
  'setup',
  'init',
  'cycles',
  'teardown',
  'total',
];

export const setup = (fn) => {
  suiteContext.getContext().setup = fn;
};

export const teardown = (fn) => {
  suiteContext.getContext().teardown = fn;
};

export const measure = (title, fn) => {
  suiteContext.getContext().measures.push({ title, init: fn });
};

export const perform = (title, count, args) => {
  suiteContext.getContext().performs.push({ title, count, args });
};

export const benchmark = (title, fn) => {
  const setup = NOOP;
  const teardown = NOOP;
  const measures = [];
  const performs = [];

  overtakeContext.getContext().suites.push({
    title,
    setup,
    teardown,
    measures,
    performs,
    init: fn,
  });
};

export const createScript = async (filename, fn) => {
  const suites = [];
  const script = { filename, suites };
  await overtakeContext.contextualize(script, fn);

  return script;
};

export const load = async (filename) => {
  return createScript(filename, () => import(filename));
};

const map = {
  script: '⭐ Script ',
  suite: '⇶ Suite ',
  perform: '➤ Perform ',
  measure: '✓ Measure',
};

export const defaultReporter = async (type, title, test, fields) => {
  console.group(`${map[type]} ${title}`);
  await test({
    test: (...args) => defaultReporter(...args, fields),
    output: (report) =>
      console.table(
        report.success
          ? {
              [formatFloat(report.mode)]: fields.reduce((data, field) => {
                const [key, alias = key] = field.split(':');
                data[alias] = formatFloat(report[key]);
                return data;
              }, {}),
            }
          : {
              error: {
                reason: report.error,
              },
            },
      ),
  });
  console.groupEnd();
};

const ACCURACY = 6;
export function formatFloat(value, digits = ACCURACY) {
  return parseFloat(value.toFixed(digits));
}

export const run = async (scripts, reporter, fields) => {
  for (const script of scripts) {
    await reporter(
      'script',
      script.filename,
      async (scriptTest) => {
        for (const suite of script.suites) {
          await scriptTest.test('suite', suite.title, async (suiteTest) => {
            await suiteContext.contextualize(suite, suite.init);
            for (const perform of suite.performs) {
              await suiteTest.test('perform', perform.title, async (performTest) => {
                for (const measure of suite.measures) {
                  await performTest.test('measure', perform.count + ' ' + measure.title, async (measureTest) => {
                    const result = await runWorker({
                      setup: suite.setup,
                      teardown: suite.teardown,
                      init: measure.init,
                      count: perform.count,
                      args: perform.args,
                    });
                    measureTest.output(result);
                  });
                }
              });
            }
          });
        }
      },
      fields,
    );
  }
};

export async function runWorker({ args, count, ...options }, onProgress = null) {
  const setupCode = options.setup.toString();
  const teardownCode = options.teardown.toString();
  const initCode = options.init.toString();
  const params = JSON.stringify({
    setupCode,
    teardownCode,
    initCode,
    count,
    args,
  });

  const worker = new WorkerThreads.Worker(new URL('runner.js', import.meta.url), { argv: [params] });
  return new Promise((resolve) => {
    worker.on('message', (data) => {
      if (onProgress && data.type === 'progress') {
        onProgress(data);
      } else if (data.type === 'report') {
        resolve(data);
      }
    });
    worker.on('error', (error) => resolve({ success: false, error: error.message }));
  });
}

const FALSE_START = () => {
  throw new Error('False start');
};

export async function start(input) {
  const { setupCode, teardownCode, initCode, count, reportInterval = 500, args = [[]] } = JSON.parse(input);
  const setup = Function(`return ${setupCode};`)();
  const teardown = Function(`return ${teardownCode};`)();
  const init = Function(`return ${initCode};`)();
  const initArgsSize = init.length;
  const send = WorkerThreads.parentPort ? (data) => WorkerThreads.parentPort.postMessage(data) : (data) => console.log(data);
  let i = count;
  let done = FALSE_START;

  const timings = [];
  const argSize = args.length;

  send({ type: 'progress', stage: 'setup' });
  const startMark = performance.now();
  const context = await setup();
  const setupMark = performance.now();

  const initArgs = [];
  if (initArgsSize !== 0) {
    initArgs.push(() => done());
  }
  if (initArgsSize > 2) {
    initArgs.unshift(args);
  }
  if (initArgsSize > 1) {
    initArgs.unshift(context);
  }

  send({ type: 'progress', stage: 'init' });
  const initMark = performance.now();
  const action = await init(...initArgs);
  const initDoneMark = performance.now();

  try {
    let lastCheck = performance.now();
    const loop = (resolve, reject) => {
      const idx = count - i;
      const argIdx = idx % argSize;
      const timerId = setTimeout(reject, 10000, new Error('Timeout'));

      done = () => {
        const doneTick = performance.now();
        const elapsed = doneTick - startTickTime;
        clearTimeout(timerId);
        done = FALSE_START;
        timings.push(elapsed);
        if (doneTick - lastCheck > reportInterval) {
          lastCheck = doneTick;
          send({ type: 'progress', stage: 'cycles', progress: idx / count });
        }
        resolve();
      };

      const startTickTime = performance.now();
      action(...args[argIdx], idx);
      if (!initArgsSize) {
        done();
      }
    };
    const cyclesMark = performance.now();

    send({ type: 'progress', stage: 'cycles', progress: 0 });
    while (i--) {
      await new Promise(loop);
    }
    send({ type: 'progress', stage: 'teardown' });
    const teardownMark = performance.now();
    await teardown(context);
    const completeMark = performance.now();
    send({ type: 'progress', stage: 'complete', progress: (count - i) / count });

    timings.sort((a, b) => a - b);

    const min = timings[0];
    const max = timings[timings.length - 1];
    const range = max - min || Number.MIN_VALUE;
    const sum = timings.reduce((a, b) => a + b, 0);
    const avg = sum / timings.length;

    const step = range / 99 || Number.MIN_VALUE;
    const buckets = Array(100)
      .fill(0)
      .map((_, idx) => [min + idx * step, 0]);

    // Calc mode O(n)
    timings.forEach((timing, idx) => {
      const index = Math.round((timing - min) / step);
      buckets[index][1] += 1;
    });
    buckets.sort((a, b) => a[1] - b[1]);

    const percentile = (p) => timings[Math.trunc((p * timings.length) / 100)];
    const mode = buckets[buckets.length - 1][0];

    send({
      type: 'report',
      success: true,
      count: timings.length,
      min,
      max,
      sum,
      avg,
      mode,
      p1: percentile(1),
      p5: percentile(5),
      p10: percentile(10),
      p20: percentile(20),
      p33: percentile(33),
      p50: percentile(50),
      med: percentile(50),
      p66: percentile(66),
      p80: percentile(80),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
      setup: setupMark - startMark,
      init: initDoneMark - initMark,
      cycles: teardownMark - cyclesMark,
      teardown: completeMark - teardownMark,
      total: completeMark - setupMark,
    });
  } catch (error) {
    send({ type: 'report', success: false, error: error.stack });
  }
}
