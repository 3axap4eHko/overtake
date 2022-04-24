import WorkerThreads from 'worker_threads';

export const suites = [];

const NOOP = () => {};

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '⠿'];
const SPINNER_INTERVAL = 80;

const ACCURACY = 6;

const renderSpinner = (index) => {
  process.stdout.moveCursor(0, -1);
  process.stdout.write(SPINNER[index]);
  process.stdout.moveCursor(-3, 1);
};

export function benchmark(title, init) {
  const suite = {
    title,
    current: true,
    measures: [],
    performs: [],
    setup: NOOP,
    teardown: NOOP,
  };
  suites.push(suite);
  init();
  suite.current = false;
}

export function getSuite() {
  const suite = suites[suites.length - 1];
  if (!suite.current) {
    throw new Error('should be inside benchmark');
  }
  return suite;
}

export function setup(init) {
  const suite = getSuite();
  suite.setup = init;
}

export function teardown(init) {
  const suite = getSuite();
  suite.teardown = init;
}

export function measure(title, init) {
  const suite = getSuite();
  suite.measures.push({ title, init });
}

export function perform(title, count, args) {
  const suite = getSuite();
  suite.performs.push({ title, count, args });
}

export function formatFloat(value, digits = ACCURACY) {
  return parseFloat(value.toFixed(digits));
}

export async function runWorker({ args, count, ...options }) {
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
  let i = 0;
  const spinnerSize = SPINNER.length - 1;

  const timerId = setInterval(() => renderSpinner(i++ % spinnerSize), SPINNER_INTERVAL);

  const worker = new WorkerThreads.Worker(new URL('runner.js', import.meta.url), { argv: [params] });
  return new Promise((resolve) => {
    worker.on('message', resolve);
    worker.on('error', (error) => resolve({ success: false, error: error.message }));
  }).finally((result) => {
    clearInterval(timerId);
    renderSpinner(spinnerSize);

    return result;
  });
}

export async function runner(suite) {
  console.group(`\nStart ${suite.title} benchmark`);

  for (let measureIdx = 0; measureIdx < suite.measures.length; measureIdx++) {
    const currentMeasure = suite.measures[measureIdx];
    const reports = {};
    console.group(`\n  Measuring performance of ${currentMeasure.title}`);
    for (let performIdx = 0; performIdx < suite.performs.length; performIdx++) {
      const currentPerform = suite.performs[performIdx];
      const report = await runWorker({
        setup: suite.setup,
        teardown: suite.teardown,
        init: currentMeasure.init,
        count: currentPerform.count,
        args: currentPerform.args,
      });
      reports[currentPerform.title] = { title: perform.title, report };
      if (report.success) {
        reports[currentPerform.title] = {
          Count: currentPerform.count,
          'Setup, ms': formatFloat(report.setup),
          'Work, ms': formatFloat(report.work),
          'Avg, ms': formatFloat(report.avg),
          'Mode, ms': report.mode,
        };
      } else {
        reports[`${currentPerform.title} ${currentMeasure.title}`] = {
          Count: currentPerform.count,
          'Setup, ms': '?',
          'Work, ms': '?',
          'Avg, ms': '?',
          'Mode, ms': '?',
          Error: report.error,
        };
      }
    }
    console.groupEnd();
    console.table(reports);
  }
  console.groupEnd();
}

const FALSE_START = () => {
  throw new Error('False start');
};

export async function start(input) {
  const { setupCode, teardownCode, initCode, count, args = [[]] } = JSON.parse(input);
  const setup = Function(`return ${setupCode};`)();
  const teardown = Function(`return ${teardownCode};`)();
  const init = Function(`return ${initCode};`)();

  let i = count;
  let done = FALSE_START;

  const timings = [];
  const argSize = args.length;
  const context = await setup();
  const initArgs = [() => done()];
  if (init.length > 2) {
    initArgs.unshift(args);
  }
  if (init.length > 1) {
    initArgs.unshift(context);
  }
  const startMark = performance.now();
  const action = await init(...initArgs);
  const workMark = performance.now();

  try {
    const loop = (resolve, reject) => {
      const argIdx = i % argSize;
      const timerId = setTimeout(reject, 10000, new Error('Timeout'));

      done = () => {
        // eslint-disable-next-line
        const elapsed = performance.now() - startTickTime;
        clearTimeout(timerId);
        done = FALSE_START;
        timings.push(elapsed);

        resolve();
      };
      const startTickTime = performance.now();
      action(...args[argIdx], count - i);
    };

    while (i--) {
      await new Promise(loop);
    }
    const completeMark = performance.now();

    await teardown(context);

    timings.sort();

    const {
      mode: { time: mode },
    } = timings
      .map((time) => parseFloat(time.toFixed(ACCURACY)))
      .reduce((result, time) => {
        const value = (result[time] || 0) + 1;
        const mode = !result.mode || result.mode.value < value ? { time, value } : result.mode;
        return { ...result, [time]: value, mode };
      }, {});

    const min = timings.reduce((a, b) => Math.min(a, b), Infinity);
    const max = timings.reduce((a, b) => Math.max(a, b), 0);
    const avg = timings.reduce((a, b) => a + b, 0) / count;
    const p90idx = parseInt(timings.length * 0.9, 10);
    const p95idx = parseInt(timings.length * 0.95, 10);
    const p99idx = parseInt(timings.length * 0.99, 10);
    const p90 = timings[p90idx];
    const p95 = timings[p95idx];
    const p99 = timings[p99idx];

    WorkerThreads.parentPort.postMessage({
      min,
      max,
      avg,
      p90,
      p95,
      p99,
      mode,
      setup: workMark - startMark,
      work: completeMark - workMark,
      success: true,
    });
  } catch (error) {
    WorkerThreads.parentPort.postMessage({ success: false, error: error.stack });
  }
}
