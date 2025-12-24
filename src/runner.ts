import { performance, PerformanceObserver } from 'node:perf_hooks';
import { Options, Control } from './types.js';
import { GCWatcher } from './gc-watcher.js';
import { StepFn, MaybePromise } from './types.js';

const COMPLETE_VALUE = 100_00;

const hr = process.hrtime.bigint.bind(process.hrtime);

const runSync = (run: Function) => {
  return (...args: unknown[]) => {
    const start = hr();
    run(...args);
    return hr() - start;
  };
};

const runAsync = (run: Function) => {
  return async (...args: unknown[]) => {
    const start = hr();
    await run(...args);
    return hr() - start;
  };
};

const isThenable = (value: unknown): value is PromiseLike<unknown> => {
  return value !== null && (typeof value === 'object' || typeof value === 'function') && typeof (value as PromiseLike<unknown>).then === 'function';
};

const TARGET_SAMPLE_NS = 1_000_000n; // aim for ~1ms per measured sample
const MAX_BATCH = 1_048_576;
const PROGRESS_STRIDE = 16;
const GC_STRIDE = 32;
const OUTLIER_MULTIPLIER = 4;
const OUTLIER_IQR_MULTIPLIER = 3;
const OUTLIER_WINDOW = 64;

type GCEvent = { start: number; end: number };

const collectSample = async <TContext, TInput>(
  batchSize: number,
  run: (ctx: TContext, data: TInput) => MaybePromise<bigint>,
  pre: StepFn<TContext, TInput> | undefined,
  post: StepFn<TContext, TInput> | undefined,
  context: TContext,
  data: TInput,
) => {
  let sampleDuration = 0n;
  for (let b = 0; b < batchSize; b++) {
    await pre?.(context, data);
    sampleDuration += await run(context, data);
    await post?.(context, data);
  }
  return sampleDuration / BigInt(batchSize);
};

const tuneParameters = async <TContext, TInput>({
  initialBatch,
  run,
  pre,
  post,
  context,
  data,
  minCycles,
  relThreshold,
  maxCycles,
}: {
  initialBatch: number;
  run: (ctx: TContext, data: TInput) => MaybePromise<bigint>;
  pre?: StepFn<TContext, TInput>;
  post?: StepFn<TContext, TInput>;
  context: TContext;
  data: TInput;
  minCycles: number;
  relThreshold: number;
  maxCycles: number;
}) => {
  let batchSize = initialBatch;
  let bestCv = Number.POSITIVE_INFINITY;
  let bestBatch = batchSize;

  for (let attempt = 0; attempt < 3; attempt++) {
    const samples: number[] = [];
    const sampleCount = Math.min(8, maxCycles);
    for (let s = 0; s < sampleCount; s++) {
      const duration = await collectSample(batchSize, run, pre, post, context, data);
      samples.push(Number(duration));
    }
    const mean = samples.reduce((acc, v) => acc + v, 0) / samples.length;
    const variance = samples.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, samples.length - 1);
    const stddev = Math.sqrt(variance);
    const cv = mean === 0 ? Number.POSITIVE_INFINITY : stddev / mean;

    if (cv < bestCv) {
      bestCv = cv;
      bestBatch = batchSize;
    }

    if (cv <= relThreshold || batchSize >= MAX_BATCH) {
      break;
    }
    batchSize = Math.min(MAX_BATCH, batchSize * 2);
  }

  const tunedRel = bestCv < relThreshold ? Math.max(bestCv * 1.5, relThreshold * 0.5) : relThreshold;
  const tunedMin = Math.min(maxCycles, Math.max(minCycles, Math.ceil(minCycles * Math.max(1, bestCv / (relThreshold || 1e-6)))));

  return { batchSize: bestBatch, relThreshold: tunedRel, minCycles: tunedMin };
};

const createGCTracker = () => {
  if (process.env.OVERTAKE_GC_OBSERVER !== '1') {
    return null;
  }
  if (typeof PerformanceObserver === 'undefined') {
    return null;
  }

  const events: GCEvent[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      events.push({ start: entry.startTime, end: entry.startTime + entry.duration });
    }
  });

  try {
    observer.observe({ entryTypes: ['gc'] });
  } catch {
    return null;
  }

  const overlaps = (start: number, end: number) => {
    let noisy = false;
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.end < start - 5_000) {
        events.splice(i, 1);
        continue;
      }
      if (event.start <= end && event.end >= start) {
        noisy = true;
      }
    }
    return noisy;
  };

  const dispose = () => observer.disconnect();

  return { overlaps, dispose };
};

const pushWindow = (arr: number[], value: number, cap: number) => {
  if (arr.length === cap) {
    arr.shift();
  }
  arr.push(value);
};

const medianAndIqr = (arr: number[]) => {
  if (arr.length === 0) return { median: 0, iqr: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  return { median, iqr: q3 - q1 };
};

const windowCv = (arr: number[]) => {
  if (arr.length < 2) return Number.POSITIVE_INFINITY;
  const mean = arr.reduce((a, v) => a + v, 0) / arr.length;
  const variance = arr.reduce((a, v) => a + (v - mean) * (v - mean), 0) / (arr.length - 1);
  const stddev = Math.sqrt(variance);
  return mean === 0 ? Number.POSITIVE_INFINITY : stddev / mean;
};

export const benchmark = async <TContext, TInput>({
  setup,
  teardown,
  pre,
  run: runRaw,
  post,
  data,

  warmupCycles,
  minCycles,
  absThreshold,
  relThreshold,
  gcObserver = false,

  durationsSAB,
  controlSAB,
}: Required<Options<TContext, TInput>>) => {
  const durations = new BigUint64Array(durationsSAB);
  const control = new Int32Array(controlSAB);

  control[Control.INDEX] = 0;
  control[Control.PROGRESS] = 0;
  control[Control.COMPLETE] = 255;

  const context = (await setup?.()) as TContext;
  const maxCycles = durations.length;
  const gcWatcher = gcObserver ? new GCWatcher() : null;
  const gcTracker = gcObserver ? createGCTracker() : null;

  try {
    // classify sync/async and capture initial duration
    await pre?.(context, data!);
    const probeStart = hr();
    const probeResult = runRaw(context, data!);
    const isAsync = isThenable(probeResult);
    if (isAsync) {
      await probeResult;
    }
    const durationProbe = hr() - probeStart;
    await post?.(context, data!);

    const run = isAsync ? runAsync(runRaw) : runSync(runRaw);

    // choose batch size to amortize timer overhead
    const durationPerRun = durationProbe === 0n ? 1n : durationProbe;
    const suggestedBatch = Number(TARGET_SAMPLE_NS / durationPerRun);
    const initialBatchSize = Math.min(MAX_BATCH, Math.max(1, suggestedBatch));

    // auto-tune based on warmup samples
    const tuned = await tuneParameters({
      initialBatch: initialBatchSize,
      run,
      pre,
      post,
      context,
      data: data as TInput,
      minCycles,
      relThreshold,
      maxCycles,
    });
    let batchSize = tuned.batchSize;
    minCycles = tuned.minCycles;
    relThreshold = tuned.relThreshold;

    // warmup: run until requested cycles, adapt if unstable
    const warmupStart = Date.now();
    let warmupRemaining = warmupCycles;
    const warmupWindow: number[] = [];
    const warmupCap = Math.max(warmupCycles, Math.min(maxCycles, warmupCycles * 4 || 1000));

    while (Date.now() - warmupStart < 1_000 && warmupRemaining > 0) {
      const start = hr();
      await pre?.(context, data!);
      await run(context, data);
      await post?.(context, data!);
      pushWindow(warmupWindow, Number(hr() - start), warmupCap);
      warmupRemaining--;
    }
    let warmupDone = 0;
    while (warmupDone < warmupRemaining) {
      const start = hr();
      await pre?.(context, data!);
      await run(context, data);
      await post?.(context, data!);
      pushWindow(warmupWindow, Number(hr() - start), warmupCap);
      warmupDone++;
      if (global.gc && warmupDone % GC_STRIDE === 0) {
        global.gc();
      }
    }
    while (warmupWindow.length >= 8 && warmupWindow.length < warmupCap) {
      const cv = windowCv(warmupWindow);
      if (cv <= relThreshold * 2) {
        break;
      }
      const start = hr();
      await pre?.(context, data!);
      await run(context, data);
      await post?.(context, data!);
      pushWindow(warmupWindow, Number(hr() - start), warmupCap);
    }

    let i = 0;
    let mean = 0n;
    let m2 = 0n;
    const outlierWindow: number[] = [];

    while (true) {
      if (i >= maxCycles) break;

      const gcMarker = gcWatcher?.start();
      const sampleStart = performance.now();
      let sampleDuration = 0n;
      for (let b = 0; b < batchSize; b++) {
        await pre?.(context, data!);
        sampleDuration += await run(context, data);
        await post?.(context, data!);
        if (global.gc && (i + b) % GC_STRIDE === 0) {
          global.gc();
        }
      }

      // normalize by batch size
      sampleDuration /= BigInt(batchSize);

      const sampleEnd = performance.now();
      const gcNoise = (gcMarker ? gcWatcher!.seen(gcMarker) : false) || (gcTracker?.overlaps(sampleStart, sampleEnd) ?? false);
      if (gcNoise) {
        continue;
      }

      const durationNumber = Number(sampleDuration);
      pushWindow(outlierWindow, durationNumber, OUTLIER_WINDOW);
      const { median, iqr } = medianAndIqr(outlierWindow);
      const maxAllowed = median + OUTLIER_IQR_MULTIPLIER * iqr || Number.POSITIVE_INFINITY;
      if (outlierWindow.length >= 8 && durationNumber > maxAllowed) {
        continue;
      }

      const meanNumber = Number(mean);
      if (i >= 8 && meanNumber > 0 && durationNumber > OUTLIER_MULTIPLIER * meanNumber) {
        continue;
      }

      durations[i++] = sampleDuration;
      const delta = sampleDuration - mean;
      mean += delta / BigInt(i);
      m2 += delta * (sampleDuration - mean);

      const progress = Math.max(i / maxCycles) * COMPLETE_VALUE;
      if (i % PROGRESS_STRIDE === 0) {
        control[Control.PROGRESS] = progress;
      }

      if (i >= minCycles) {
        const variance = Number(m2) / (i - 1);
        const stddev = Math.sqrt(variance);
        if (stddev <= Number(absThreshold)) {
          break;
        }

        const meanNum = Number(mean);
        const cov = stddev / (meanNum || 1);
        if (cov <= relThreshold) {
          break;
        }
      }
    }

    control[Control.INDEX] = i;
    control[Control.COMPLETE] = 0;
  } catch (e) {
    console.error(e && typeof e === 'object' && 'stack' in e ? e.stack : e);
    control[Control.COMPLETE] = 1;
  } finally {
    gcTracker?.dispose?.();
    try {
      await teardown?.(context);
    } catch (e) {
      control[Control.COMPLETE] = 2;
      console.error(e && typeof e === 'object' && 'stack' in e ? e.stack : e);
    }
  }

  return control[Control.COMPLETE];
};
