import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { createReport, computeStats, Report } from './reporter.ts';
import { cmp, assertNoClosure } from './utils.ts';
import {
  type ExecutorRunOptions,
  type ReportOptions,
  type WorkerOptions,
  type BenchmarkOptions,
  Control,
  type ReportType,
  type ReportTypeList,
  CONTROL_SLOTS,
  COMPLETE_VALUE,
  type ProgressCallback,
} from './types.ts';

export type ExecutorReport<R extends ReportTypeList> = Record<R[number], Report> & {
  count: number;
  heapUsedKB: number;
  dceWarning: boolean;
  error?: string;
};

export interface ExecutorOptions<R extends ReportTypeList> extends BenchmarkOptions, ReportOptions<R> {
  workers?: number;
  maxCycles?: number;
  onProgress?: ProgressCallback;
  progressInterval?: number;
}

const BENCHMARK_URL = Symbol.for('overtake.benchmarkUrl');

export interface Executor<TContext, TInput> {
  pushAsync<T>(task: ExecutorRunOptions<TContext, TInput>): Promise<T>;
  kill(): void;
}

export const createExecutor = <TContext, TInput, R extends ReportTypeList>(options: Required<ExecutorOptions<R>>): Executor<TContext, TInput> => {
  const { workers, warmupCycles, maxCycles, minCycles, absThreshold, relThreshold, gcObserver = true, reportTypes, onProgress, progressInterval = 100 } = options;
  const benchmarkUrl = (options as Record<symbol, unknown>)[BENCHMARK_URL];
  const resolvedBenchmarkUrl = typeof benchmarkUrl === 'string' ? benchmarkUrl : pathToFileURL(process.cwd()).href;

  const pending: { task: ExecutorRunOptions<TContext, TInput>; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
  let running = 0;

  const schedule = async (task: ExecutorRunOptions<TContext, TInput>) => {
    running++;
    try {
      return await runTask(task);
    } finally {
      running--;
      if (pending.length > 0) {
        const next = pending.shift()!;
        schedule(next.task).then(next.resolve, next.reject);
      }
    }
  };

  const pushAsync = <T>(task: ExecutorRunOptions<TContext, TInput>): Promise<T> => {
    if (running < workers) {
      return schedule(task) as Promise<T>;
    }
    return new Promise<T>((resolve, reject) => {
      pending.push({ task, resolve: resolve as (v: unknown) => void, reject });
    });
  };

  const runTask = async ({ id, setup, teardown, pre, run, post, data }: ExecutorRunOptions<TContext, TInput>) => {
    const setupCode = setup?.toString();
    const teardownCode = teardown?.toString();
    const preCode = pre?.toString();
    const runCode = run.toString();
    const postCode = post?.toString();

    if (setupCode) assertNoClosure(setupCode, 'setup');
    if (teardownCode) assertNoClosure(teardownCode, 'teardown');
    if (preCode) assertNoClosure(preCode, 'pre');
    assertNoClosure(runCode, 'run');
    if (postCode) assertNoClosure(postCode, 'post');

    const controlSAB = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * CONTROL_SLOTS);
    const durationsSAB = new SharedArrayBuffer(BigUint64Array.BYTES_PER_ELEMENT * maxCycles);

    const workerFile = new URL('./worker.ts', import.meta.url);
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
    let workerError: string | undefined;
    try {
      const [exitCode] = await exitPromise;
      clearTimeout(timeoutId);
      if (progressIntervalId) clearInterval(progressIntervalId);
      if (exitCode !== 0) {
        workerError = `worker exited with code ${exitCode}`;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (progressIntervalId) clearInterval(progressIntervalId);
      workerError = err instanceof Error ? err.message : String(err);
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

    const stats = count > 0 ? computeStats(durations) : undefined;
    const report = reportTypes
      .map<[string, unknown]>((type) => [type, createReport(durations, type, stats)] as [ReportType, Report])
      .concat([
        ['count', count],
        ['heapUsedKB', heapUsedKB],
        ['dceWarning', dceWarning],
        ['error', workerError],
      ]);
    return Object.fromEntries(report);
  };

  return { pushAsync, kill() {} };
};
