import { performance, PerformanceObserver } from 'node:perf_hooks';
import { Options, Control } from './types.js';
import { GCWatcher } from './gc-watcher.js';
import { StepFn } from './types.js';

const COMPLETE_VALUE = 100_00;

const hr = process.hrtime.bigint.bind(process.hrtime);

const sink = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const consume = (value: unknown) => {
  let payload = 0;
  switch (typeof value) {
    case 'number':
      payload = Number.isFinite(value) ? Math.trunc(value) : 0;
      break;
    case 'bigint':
      payload = Number(value & 0xffff_ffffn);
      break;
    case 'string':
      payload = value.length;
      break;
    case 'boolean':
      payload = value ? 1 : 0;
      break;
    case 'object':
      payload = value === null ? 0 : 1;
      break;
    case 'function':
      payload = 1;
      break;
    default:
      payload = -1;
  }
  Atomics.xor(sink, 0, payload);
};

const runSync = (run: Function, overhead: bigint) => {
  return (...args: unknown[]) => {
    const start = hr();
    const result = run(...args);
    consume(result);
    const duration = hr() - start;
    return duration > overhead ? duration - overhead : 0n;
  };
};

const runAsync = (run: Function) => {
  return async (...args: unknown[]) => {
    const start = hr();
    const result = await run(...args);
    consume(result);
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
const OUTLIER_ABS_THRESHOLD_NS = 10_000;
const BASELINE_SAMPLES = 16;
const OUTLIER_SCRATCH = new Float64Array(OUTLIER_WINDOW);

type GCEvent = { start: number; end: number };
type RunTimedSync<TContext, TInput> = (ctx: TContext, data: TInput, nonce?: number) => bigint;
type RunTimedAsync<TContext, TInput> = (ctx: TContext, data: TInput, nonce?: number) => Promise<bigint>;

const measureTimerOverhead = () => {
  let total = 0n;
  for (let i = 0; i < BASELINE_SAMPLES; i++) {
    const start = hr();
    consume(0);
    total += hr() - start;
  }
  return total / BigInt(BASELINE_SAMPLES);
};

const collectSample = async <TContext, TInput>({
  batchSize,
  run,
  runRaw,
  runIsAsync,
  pre,
  preIsAsync,
  post,
  postIsAsync,
  context,
  data,
  nextNonce,
}: {
  batchSize: number;
  run: RunTimedSync<TContext, TInput> | RunTimedAsync<TContext, TInput>;
  runRaw: StepFn<TContext, TInput>;
  runIsAsync: boolean;
  pre: StepFn<TContext, TInput> | undefined;
  preIsAsync: boolean;
  post: StepFn<TContext, TInput> | undefined;
  postIsAsync: boolean;
  context: TContext;
  data: TInput;
  nextNonce: (() => number) | null;
}) => {
  const canBatchTime = !runIsAsync && !pre && !post;
  if (canBatchTime) {
    const batchStart = hr();
    if (nextNonce) {
      for (let b = 0; b < batchSize; b++) {
        consume((runRaw as Function)(context, data, nextNonce()));
      }
    } else {
      for (let b = 0; b < batchSize; b++) {
        consume(runRaw(context, data));
      }
    }
    return (hr() - batchStart) / BigInt(batchSize);
  }

  let sampleDuration = 0n;
  for (let b = 0; b < batchSize; b++) {
    if (pre) {
      if (preIsAsync) {
        await pre(context, data);
      } else {
        pre(context, data);
      }
    }

    if (runIsAsync) {
      const runAsyncFn = run as RunTimedAsync<TContext, TInput>;
      const duration = nextNonce ? await runAsyncFn(context, data, nextNonce()) : await runAsyncFn(context, data);
      sampleDuration += duration;
    } else {
      const runSyncFn = run as RunTimedSync<TContext, TInput>;
      const duration = nextNonce ? runSyncFn(context, data, nextNonce()) : runSyncFn(context, data);
      sampleDuration += duration;
    }

    if (post) {
      if (postIsAsync) {
        await post(context, data);
      } else {
        post(context, data);
      }
    }
  }
  return sampleDuration / BigInt(batchSize);
};

const tuneParameters = async <TContext, TInput>({
  initialBatch,
  run,
  runRaw,
  runIsAsync,
  pre,
  preIsAsync,
  post,
  postIsAsync,
  context,
  data,
  minCycles,
  relThreshold,
  maxCycles,
  nextNonce,
}: {
  initialBatch: number;
  run: RunTimedSync<TContext, TInput> | RunTimedAsync<TContext, TInput>;
  runRaw: StepFn<TContext, TInput>;
  runIsAsync: boolean;
  pre?: StepFn<TContext, TInput>;
  preIsAsync: boolean;
  post?: StepFn<TContext, TInput>;
  postIsAsync: boolean;
  context: TContext;
  data: TInput;
  minCycles: number;
  relThreshold: number;
  maxCycles: number;
  nextNonce: (() => number) | null;
}) => {
  let batchSize = initialBatch;
  let bestCv = Number.POSITIVE_INFINITY;
  let bestBatch = batchSize;

  for (let attempt = 0; attempt < 3; attempt++) {
    const samples: number[] = [];
    const sampleCount = Math.min(8, maxCycles);
    for (let s = 0; s < sampleCount; s++) {
      const duration = await collectSample({
        batchSize,
        run,
        runRaw,
        runIsAsync,
        pre,
        preIsAsync,
        post,
        postIsAsync,
        context,
        data,
        nextNonce,
      });
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
  for (let i = 0; i < arr.length; i++) {
    OUTLIER_SCRATCH[i] = arr[i];
  }
  const view = OUTLIER_SCRATCH.subarray(0, arr.length);
  view.sort();
  const mid = Math.floor(view.length / 2);
  const median = view.length % 2 === 0 ? (view[mid - 1] + view[mid]) / 2 : view[mid];
  const q1Idx = Math.floor(view.length * 0.25);
  const q3Idx = Math.floor(view.length * 0.75);
  const q1 = view[q1Idx];
  const q3 = view[q3Idx];
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
  const input = data as TInput;
  const maxCycles = durations.length;
  const gcWatcher = gcObserver ? new GCWatcher() : null;
  const gcTracker = gcObserver ? createGCTracker() : null;

  try {
    // classify sync/async and capture initial duration
    let preIsAsync = false;
    if (pre) {
      const preResult = pre(context, input);
      preIsAsync = isThenable(preResult);
      if (preIsAsync) {
        await preResult;
      }
    }

    const probeStart = hr();
    const probeResult = runRaw(context, input);
    const runIsAsync = isThenable(probeResult);
    if (runIsAsync) {
      const resolved = await probeResult;
      consume(resolved);
    } else {
      consume(probeResult);
    }
    const durationProbeRaw = hr() - probeStart;

    let postIsAsync = false;
    if (post) {
      const postResult = post(context, input);
      postIsAsync = isThenable(postResult);
      if (postIsAsync) {
        await postResult;
      }
    }

    const timerOverhead = runIsAsync ? 0n : measureTimerOverhead();
    let durationProbe = runIsAsync ? durationProbeRaw : durationProbeRaw > timerOverhead ? durationProbeRaw - timerOverhead : 0n;

    const shouldPerturbInput = process.env.OVERTAKE_PERTURB_INPUT === '1';
    let nonce = 0;
    const nextNonce = shouldPerturbInput
      ? () => {
          nonce = (nonce + 1) | 0;
          return nonce;
        }
      : null;

    if (!runIsAsync && !pre && !post) {
      const batchProbeSize = 10_000;
      const batchProbeStart = hr();
      if (nextNonce) {
        for (let i = 0; i < batchProbeSize; i++) {
          consume((runRaw as Function)(context, input, nextNonce()));
        }
      } else {
        for (let i = 0; i < batchProbeSize; i++) {
          consume(runRaw(context, input));
        }
      }
      durationProbe = (hr() - batchProbeStart) / BigInt(batchProbeSize);
    }

    const runTimedSync = runIsAsync ? null : runSync(runRaw, timerOverhead);
    const runTimedAsync = runIsAsync ? runAsync(runRaw) : null;
    const run = runIsAsync ? runTimedAsync! : runTimedSync!;

    const runOnceSync: RunTimedSync<TContext, TInput> | null = runIsAsync ? null : nextNonce ? (ctx, dataValue) => runTimedSync!(ctx, dataValue, nextNonce()) : runTimedSync!;
    const runOnceAsync: RunTimedAsync<TContext, TInput> | null = runIsAsync ? (nextNonce ? (ctx, dataValue) => runTimedAsync!(ctx, dataValue, nextNonce()) : runTimedAsync!) : null;

    const preSync = preIsAsync ? null : pre;
    const preAsync = preIsAsync ? pre : null;
    const postSync = postIsAsync ? null : post;
    const postAsync = postIsAsync ? post : null;

    // choose batch size to amortize timer overhead
    const durationPerRun = durationProbe === 0n ? 1n : durationProbe;
    const suggestedBatch = Number(TARGET_SAMPLE_NS / durationPerRun);
    const minBatchForFastOps = durationProbe < 100n ? 100_000 : 1;
    const initialBatchSize = Math.min(MAX_BATCH, Math.max(minBatchForFastOps, suggestedBatch));

    // auto-tune based on warmup samples
    const tuned = await tuneParameters({
      initialBatch: initialBatchSize,
      run,
      runRaw,
      runIsAsync,
      pre,
      preIsAsync,
      post,
      postIsAsync,
      context,
      data: input,
      minCycles,
      relThreshold,
      maxCycles,
      nextNonce,
    });
    let batchSize = tuned.batchSize;
    minCycles = tuned.minCycles;
    relThreshold = tuned.relThreshold;

    // warmup: run until requested cycles, adapt if unstable
    const warmupStart = performance.now();
    let warmupRemaining = warmupCycles;
    const warmupWindow: number[] = [];
    const warmupCap = Math.max(warmupCycles, Math.min(maxCycles, warmupCycles * 4 || 1000));
    const canBatchTime = !runIsAsync && !preSync && !preAsync && !postSync && !postAsync;

    const runWarmup = async () => {
      if (canBatchTime) {
        const batchStart = hr();
        if (nextNonce) {
          for (let b = 0; b < batchSize; b++) {
            consume((runRaw as Function)(context, input, nextNonce()));
          }
        } else {
          for (let b = 0; b < batchSize; b++) {
            consume(runRaw(context, input));
          }
        }
        return (hr() - batchStart) / BigInt(batchSize);
      }

      if (preSync) {
        preSync(context, input);
      } else if (preAsync) {
        await preAsync(context, input);
      }

      const duration = runIsAsync ? await runOnceAsync!(context, input) : runOnceSync!(context, input);

      if (postSync) {
        postSync(context, input);
      } else if (postAsync) {
        await postAsync(context, input);
      }

      return duration;
    };

    while (performance.now() - warmupStart < 1_000 && warmupRemaining > 0) {
      const duration = await runWarmup();
      pushWindow(warmupWindow, Number(duration), warmupCap);
      warmupRemaining--;
    }
    let warmupDone = 0;
    while (warmupDone < warmupRemaining) {
      const duration = await runWarmup();
      pushWindow(warmupWindow, Number(duration), warmupCap);
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
      const duration = await runWarmup();
      pushWindow(warmupWindow, Number(duration), warmupCap);
    }

    let i = 0;
    let mean = 0n;
    let m2 = 0n;
    const outlierWindow: number[] = [];
    let skipped = 0;
    const maxSkipped = maxCycles * 10;
    let disableFiltering = false;

    while (true) {
      if (i >= maxCycles) break;
      if (!disableFiltering && skipped >= maxSkipped) {
        console.error(`Warning: ${skipped} samples skipped due to noise/outlier detection. ` + `Disabling filtering for remaining samples. Results may have higher variance.`);
        disableFiltering = true;
      }

      if (global.gc && i > 0 && i % GC_STRIDE === 0) {
        global.gc();
      }

      const gcMarker = gcWatcher?.start();
      const sampleStart = performance.now();
      let sampleDuration = 0n;

      if (canBatchTime) {
        const batchStart = hr();
        if (nextNonce) {
          for (let b = 0; b < batchSize; b++) {
            consume((runRaw as Function)(context, input, nextNonce()));
          }
        } else {
          for (let b = 0; b < batchSize; b++) {
            consume(runRaw(context, input));
          }
        }
        const batchDuration = hr() - batchStart;
        sampleDuration = batchDuration / BigInt(batchSize);
      } else {
        for (let b = 0; b < batchSize; b++) {
          if (preSync) {
            preSync(context, input);
          } else if (preAsync) {
            await preAsync(context, input);
          }

          const duration = runIsAsync ? await runOnceAsync!(context, input) : runOnceSync!(context, input);
          sampleDuration += duration;

          if (postSync) {
            postSync(context, input);
          } else if (postAsync) {
            await postAsync(context, input);
          }
        }
        sampleDuration /= BigInt(batchSize);
      }

      const sampleEnd = performance.now();
      if (!disableFiltering) {
        const gcNoise = (gcMarker ? gcWatcher!.seen(gcMarker) : false) || (gcTracker?.overlaps(sampleStart, sampleEnd) ?? false);
        if (gcNoise) {
          skipped++;
          continue;
        }
      }

      const durationNumber = Number(sampleDuration);
      pushWindow(outlierWindow, durationNumber, OUTLIER_WINDOW);
      if (!disableFiltering) {
        const { median, iqr } = medianAndIqr(outlierWindow);
        const maxAllowed = median + OUTLIER_IQR_MULTIPLIER * iqr || Number.POSITIVE_INFINITY;
        if (outlierWindow.length >= 8 && durationNumber > maxAllowed && durationNumber - median > OUTLIER_ABS_THRESHOLD_NS) {
          skipped++;
          continue;
        }

        const meanNumber = Number(mean);
        if (i >= 8 && meanNumber > 0 && durationNumber > OUTLIER_MULTIPLIER * meanNumber && durationNumber - meanNumber > OUTLIER_ABS_THRESHOLD_NS) {
          skipped++;
          continue;
        }
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
