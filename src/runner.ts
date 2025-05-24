import { Options, Control } from './types.js';

const COMPLETE_VALUE = 100_00;

const runSync = (run: Function) => {
  return (...args: unknown[]) => {
    const start = process.hrtime.bigint();
    run(...args);
    return process.hrtime.bigint() - start;
  };
};

const runAsync = (run: Function) => {
  return async (...args: unknown[]) => {
    const start = process.hrtime.bigint();
    await run(...args);
    return process.hrtime.bigint() - start;
  };
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

  try {
    await pre?.(context, data!);
    const result = runRaw(context, data!);
    await post?.(context, data!);
    const run = result instanceof Promise ? runAsync(runRaw) : runSync(runRaw);
    const start = Date.now();
    while (Date.now() - start < 1_000) {
      Math.sqrt(Math.random());
    }
    for (let i = 0; i < warmupCycles; i++) {
      await pre?.(context, data!);
      await run(context, data);
      await post?.(context, data!);
    }

    let i = 0;
    let mean = 0n;
    let m2 = 0n;

    while (true) {
      if (i >= maxCycles) break;

      await pre?.(context, data!);
      const duration = await run(context, data);
      await post?.(context, data!);

      durations[i++] = duration;
      const delta = duration - mean;
      mean += delta / BigInt(i);
      m2 += delta * (duration - mean);

      const progress = Math.max(i / maxCycles) * COMPLETE_VALUE;
      control[Control.PROGRESS] = progress;

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
    try {
      await teardown?.(context);
    } catch (e) {
      control[Control.COMPLETE] = 2;
      console.error(e && typeof e === 'object' && 'stack' in e ? e.stack : e);
    }
  }

  return control[Control.COMPLETE];
};
