import { workerData } from 'node:worker_threads';
import { benchmark } from './runner.js';
import { SetupFn, TeardownFn, StepFn, WorkerOptions } from './types.js';

const {
  setupCode,
  teardownCode,
  preCode,
  runCode,
  postCode,
  data,

  warmupCycles,
  minCycles,
  absThreshold,
  relThreshold,

  durationsSAB,
  controlSAB,
}: WorkerOptions = workerData;

const setup: SetupFn<unknown> = setupCode && Function(`return ${setupCode};`)();
const teardown: TeardownFn<unknown> = teardownCode && Function(`return ${teardownCode};`)();

const pre: StepFn<unknown, unknown> = preCode && Function(`return ${preCode};`)();
const run: StepFn<unknown, unknown> = runCode && Function(`return ${runCode};`)();
const post: StepFn<unknown, unknown> = postCode && Function(`return ${postCode};`)();

export const exitCode = await benchmark({
  setup,
  teardown,
  pre,
  run,
  post,
  data,

  warmupCycles,
  minCycles,
  absThreshold,
  relThreshold,

  durationsSAB,
  controlSAB,
});

process.exit(exitCode);
