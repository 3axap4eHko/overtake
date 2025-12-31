import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { queue } from 'async';
import { pathToFileURL } from 'node:url';
import { createReport, Report } from './reporter.js';
import { cmp } from './utils.js';
import { RunOptions, ReportOptions, WorkerOptions, BenchmarkOptions, Control, ReportType, ReportTypeList, CONTROL_SLOTS } from './types.js';

export type ExecutorReport<R extends ReportTypeList> = Record<R[number], Report> & { count: number };

export interface ExecutorOptions<R extends ReportTypeList> extends BenchmarkOptions, ReportOptions<R> {
  workers?: number;
  maxCycles?: number;
}

const BENCHMARK_URL = Symbol.for('overtake.benchmarkUrl');

export const createExecutor = <TContext, TInput, R extends ReportTypeList>(options: Required<ExecutorOptions<R>>) => {
  const { workers, warmupCycles, maxCycles, minCycles, absThreshold, relThreshold, gcObserver = true, reportTypes } = options;
  const benchmarkUrl = (options as Record<symbol, unknown>)[BENCHMARK_URL];
  const resolvedBenchmarkUrl = typeof benchmarkUrl === 'string' ? benchmarkUrl : pathToFileURL(process.cwd()).href;

  const executor = queue<RunOptions<TContext, TInput>>(async ({ setup, teardown, pre, run, post, data }) => {
    const setupCode = setup?.toString();
    const teardownCode = teardown?.toString();
    const preCode = pre?.toString();
    const runCode = run.toString()!;
    const postCode = post?.toString();

    const controlSAB = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * CONTROL_SLOTS);
    const durationsSAB = new SharedArrayBuffer(BigUint64Array.BYTES_PER_ELEMENT * maxCycles);

    const workerFile = new URL('./worker.js', import.meta.url);
    const workerData: WorkerOptions = {
      benchmarkUrl: resolvedBenchmarkUrl,
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
      gcObserver,

      controlSAB,
      durationsSAB,
    };

    const worker = new Worker(workerFile, {
      workerData,
    });
    const [exitCode] = await once(worker, 'exit');
    if (exitCode !== 0) {
      throw new Error(`worker exited with code ${exitCode}`);
    }

    const control = new Int32Array(controlSAB);
    const count = control[Control.INDEX];
    const durations = new BigUint64Array(durationsSAB).slice(0, count).sort(cmp);

    const report = reportTypes.map<[string, unknown]>((type) => [type, createReport(durations, type)] as [ReportType, Report]).concat([['count', count]]);
    return Object.fromEntries(report);
  }, workers);

  executor.error((err) => {
    console.error(err);
  });

  return executor;
};
