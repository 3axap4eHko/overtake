import Path from 'path';
import WorkerThreads from 'worker_threads';
import { Event } from 'evnty';

export const NOOP = () => {};

export class Perform {
  title = '';

  count = 0;

  args;

  constructor(overtake, title, count, args) {
    this.title = title;
    this.count = count;
    this.args = args;
  }
}

export class Measure {
  title = '';

  init = NOOP;

  constructor(overtake, title, init = NOOP) {
    this.title = title;
    this.init = init;
  }
}

export class Suite {
  title = '';

  setup = NOOP;

  measures = [];

  performs = [];

  teardown = NOOP;

  #title = '';

  #init = NOOP;

  #overtake = null;

  constructor(overtake, title, init = NOOP) {
    this.#overtake = overtake;
    this.title = title;
    this.#init = init;
  }

  async init() {
    const unsubscribes = [
      this.#overtake.onSetupRegister.on((setup) => (this.setup = setup)),
      this.#overtake.onMeasureRegister.on((measure) => this.measures.push(measure)),
      this.#overtake.onPerformRegister.on((perform) => this.performs.push(perform)),
      this.#overtake.onTeardownRegister.on((teardown) => (this.teardown = teardown)),
    ];
    await this.#init();
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  }
}

export class Script {
  onLoad = new Event();

  filename = '';

  suites = [];

  constructor(filename) {
    this.filename = filename;
  }
}

export class Overtake {
  onLoad = new Event();

  onRun = new Event();

  onComplete = new Event();

  onScriptRegister = new Event();

  onScriptStart = new Event();

  onScriptComplete = new Event();

  onSuiteRegister = new Event();

  onSuiteStart = new Event();

  onSuiteComplete = new Event();

  onSetupRegister = new Event();

  onTeardownRegister = new Event();

  onMeasureRegister = new Event();

  onMeasureStart = new Event();

  onMeasureComplete = new Event();

  onPerformRegister = new Event();

  onPerformStart = new Event();

  onPerformProgress = new Event();

  onPerformComplete = new Event();

  onReport = new Event();

  scripts = [];

  reporters = [];

  constructor(options = {}) {
    Object.assign(globalThis, {
      benchmark: (title, init) => this.onSuiteRegister(new Suite(this, title, init)),
      setup: (init) => this.onSetupRegister(init),
      teardown: (init) => this.onTeardownRegister(init),
      measure: (title, init) => this.onMeasureRegister(new Measure(this, title, init)),
      perform: (title, count, args) => this.onPerformRegister(new Perform(this, title, count, args)),
      reporter: (reporter) => this.reporters.push(reporter(this)),
    });
  }

  async load(files) {
    this.onLoad(this);
    for (const file of files) {
      const filename = Path.resolve(file);
      const script = new Script(filename);
      const unsubscribe = this.onSuiteRegister.on((suite) => {
        script.suites.push(suite);
      });
      await import(filename);
      unsubscribe();
      this.scripts.push(script);
      this.onScriptRegister(script);
    }
  }

  async run() {
    this.onRun();
    for (const script of this.scripts) {
      this.onScriptStart(script);
      for (const suite of script.suites) {
        await suite.init().catch((e) => console.error(e));
        this.onSuiteStart(suite);
        for (const measure of suite.measures) {
          this.onMeasureStart(measure);
          for (const perform of suite.performs) {
            this.onPerformStart(perform);
            const result = await runWorker(
              {
                setup: suite.setup,
                teardown: suite.teardown,
                init: measure.init,
                count: perform.count,
                args: perform.args,
              },
              this.onPerformProgress
            );
            this.onPerformComplete(perform);
            this.onReport(result);
          }
          this.onMeasureComplete(perform);
        }
        this.onSuiteComplete(perform);
      }
      this.onScriptComplete(perform);
    }
    this.onComplete(this);
  }
}

export async function runWorker({ args, count, ...options }, onProgress) {
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
      if (data.type === 'progress') {
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
  const send = WorkerThreads.parentPort ? (data) => WorkerThreads.parentPort.postMessage(data) : (data) => console.log(data);

  let i = count;
  let done = FALSE_START;

  const timings = [];
  const argSize = args.length;

  send({ type: 'progress', stage: 'setup' });
  const startMark = performance.now();
  const context = await setup();
  const setupMark = performance.now();

  const initArgs = [() => done()];
  if (init.length > 2) {
    initArgs.unshift(args);
  }
  if (init.length > 1) {
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

    const medIdx = Math.trunc((50 * timings.length) / 100);
    const med = timings[medIdx];
    const p90Idx = Math.trunc((90 * timings.length) / 100);
    const p90 = timings[p90Idx];
    const p95Idx = Math.trunc((95 * timings.length) / 100);
    const p95 = timings[p95Idx];
    const p99Idx = Math.trunc((99 * timings.length) / 100);
    const p99 = timings[p99Idx];
    const mode = buckets[buckets.length - 1][0];

    send({
      type: 'report',
      success: true,
      count: timings.length,
      min,
      max,
      sum,
      avg,
      med,
      mode,
      p90,
      p95,
      p99,
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
