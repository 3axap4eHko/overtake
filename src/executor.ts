import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { queue } from 'async';
import { pathToFileURL } from 'node:url';
import { createReport, Report } from './reporter.js';
import { cmp } from './utils.js';
import {
  ExecutorRunOptions,
  ReportOptions,
  WorkerOptions,
  BenchmarkOptions,
  Control,
  ReportType,
  ReportTypeList,
  CONTROL_SLOTS,
  COMPLETE_VALUE,
  ProgressCallback,
} from './types.js';

export type ExecutorReport<R extends ReportTypeList> = Record<R[number], Report> & {
  count: number;
  heapUsedKB: number;
  dceWarning: boolean;
};

export interface ExecutorOptions<R extends ReportTypeList> extends BenchmarkOptions, ReportOptions<R> {
  workers?: number;
  maxCycles?: number;
  onProgress?: ProgressCallback;
  progressInterval?: number;
}

const BENCHMARK_URL = Symbol.for('overtake.benchmarkUrl');

export const createExecutor = <TContext, TInput, R extends ReportTypeList>(options: Required<ExecutorOptions<R>>) => {
  const { workers, warmupCycles, maxCycles, minCycles, absThreshold, relThreshold, gcObserver = true, reportTypes, onProgress, progressInterval = 100 } = options;
  const benchmarkUrl = (options as Record<symbol, unknown>)[BENCHMARK_URL];
  const resolvedBenchmarkUrl = typeof benchmarkUrl === 'string' ? benchmarkUrl : pathToFileURL(process.cwd()).href;

  const executor = queue<ExecutorRunOptions<TContext, TInput>>(async ({ id, setup, teardown, pre, run, post, data }) => {
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

    const control = new Int32Array(controlSAB);
    let progressIntervalId: ReturnType<typeof setInterval> | undefined;
    if (onProgress && id) {
      progressIntervalId = setInterval(() => {
        const progress = control[Control.PROGRESS] / COMPLETE_VALUE;
        onProgress({ id, progress });
      }, progressInterval);
    }

    const WORKER_TIMEOUT_MS = 300_000;
    const exitPromise = once(worker, 'exit');
    const timeoutId = setTimeout(() => worker.terminate(), WORKER_TIMEOUT_MS);
    try {
      const [exitCode] = await exitPromise;
      clearTimeout(timeoutId);
      if (progressIntervalId) clearInterval(progressIntervalId);
      if (exitCode !== 0) {
        throw new Error(`worker exited with code ${exitCode}`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (progressIntervalId) clearInterval(progressIntervalId);
      throw err;
    }

    const count = control[Control.INDEX];
    const heapUsedKB = control[Control.HEAP_USED];
    const durations = new BigUint64Array(durationsSAB).slice(0, count).sort(cmp);

    const DCE_THRESHOLD_OPS = 5_000_000_000;
    let dceWarning = false;
    if (count > 0) {
      let sum = 0n;
      for (const d of durations) sum += d;
      const avgNs = Number(sum / BigInt(count)) / 1000;
      const opsPerSec = avgNs > 0 ? 1_000_000_000 / avgNs : Infinity;
      if (opsPerSec > DCE_THRESHOLD_OPS) {
        dceWarning = true;
      }
    }

    const report = reportTypes
      .map<[string, unknown]>((type) => [type, createReport(durations, type)] as [ReportType, Report])
      .concat([
        ['count', count],
        ['heapUsedKB', heapUsedKB],
        ['dceWarning', dceWarning],
      ]);
    return Object.fromEntries(report);
  }, workers);

  executor.error((err) => {
    console.error(err);
  });

  return executor;
};
