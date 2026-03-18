import { cpus } from 'node:os';
import Progress from 'progress';
import { createExecutor, type ExecutorOptions, type ExecutorReport } from './executor.js';
import { type MaybePromise, type StepFn, type SetupFn, type TeardownFn, type FeedFn, type ReportType, type ReportTypeList, DEFAULT_CYCLES, type ProgressInfo } from './types.js';

declare global {
  const benchmark: typeof Benchmark.create;
}

export const DEFAULT_WORKERS = Math.max(1, Math.ceil(cpus().length / 4));

const BENCHMARK_URL = Symbol.for('overtake.benchmarkUrl');

export interface TargetReport<R extends ReportTypeList> {
  target: string;
  measures: MeasureReport<R>[];
}

export interface MeasureReport<R extends ReportTypeList> {
  measure: string;
  feeds: FeedReport<R>[];
}

export interface FeedReport<R extends ReportTypeList> {
  feed: string;
  data: ExecutorReport<R>;
}

export const DEFAULT_REPORT_TYPES = ['ops'] as const;
export type DefaultReportTypes = (typeof DEFAULT_REPORT_TYPES)[number];

const createExecutorErrorReport = <R extends ReportTypeList>(error: unknown): ExecutorReport<R> =>
  ({
    count: 0,
    heapUsedKB: 0,
    dceWarning: false,
    error: error instanceof Error ? error.message : String(error),
  }) as ExecutorReport<R>;

export class MeasureContext<TContext, TInput> {
  pre?: StepFn<TContext, TInput>;
  post?: StepFn<TContext, TInput>;
  title: string;
  run: StepFn<TContext, TInput>;

  constructor(title: string, run: StepFn<TContext, TInput>) {
    this.title = title;
    this.run = run;
  }
}

export class Measure<TContext, TInput> {
  #ctx: MeasureContext<TContext, TInput>;

  constructor(ctx: MeasureContext<TContext, TInput>) {
    this.#ctx = ctx;
  }

  pre(fn: StepFn<TContext, TInput>): Measure<TContext, TInput> {
    this.#ctx.pre = fn;
    return this;
  }
  post(fn: StepFn<TContext, TInput>): Measure<TContext, TInput> {
    this.#ctx.post = fn;
    return this;
  }
}

export class TargetContext<TContext, TInput> {
  teardown?: TeardownFn<TContext>;
  measures: MeasureContext<TContext, TInput>[] = [];
  readonly title: string;
  readonly setup?: SetupFn<MaybePromise<TContext>>;

  constructor(title: string, setup?: SetupFn<MaybePromise<TContext>>) {
    this.title = title;
    this.setup = setup;
  }
}

export class Target<TContext, TInput> {
  #ctx: TargetContext<TContext, TInput>;

  constructor(ctx: TargetContext<TContext, TInput>) {
    this.#ctx = ctx;
  }
  teardown(fn: TeardownFn<TContext>): Target<TContext, TInput> {
    this.#ctx.teardown = fn;

    return this;
  }
  measure(title: string, run: StepFn<TContext, TInput>): Measure<TContext, TInput> {
    const measure = new MeasureContext(title, run);
    this.#ctx.measures.push(measure);

    return new Measure(measure);
  }
}

export class FeedContext<TInput> {
  readonly title: string;
  readonly fn?: FeedFn<TInput>;

  constructor(title: string, fn?: FeedFn<TInput>) {
    this.title = title;
    this.fn = fn;
  }
}

export class Benchmark<TInput> {
  #targets: TargetContext<unknown, TInput>[] = [];
  #feeds: FeedContext<TInput>[] = [];
  #executed = false;

  static create(title: string): Benchmark<void>;
  static create<I>(title: string, fn: FeedFn<I>): Benchmark<I>;
  static create<I>(title: string, fn?: FeedFn<I> | undefined): Benchmark<I> {
    if (fn) {
      return new Benchmark(title, fn);
    } else {
      return new Benchmark(title);
    }
  }

  constructor(title: string);
  constructor(title: string, fn: FeedFn<TInput>);
  constructor(title: string, fn?: FeedFn<TInput> | undefined) {
    if (fn) {
      this.feed(title, fn);
    } else {
      this.feed(title);
    }
  }

  feed(title: string): Benchmark<TInput | void>;
  feed<I>(title: string, fn: FeedFn<I>): Benchmark<TInput | I>;
  feed<I>(title: string, fn?: FeedFn<I> | undefined): Benchmark<TInput | I> {
    const self = this as Benchmark<TInput | I>;
    self.#feeds.push(fn ? new FeedContext(title, fn) : new FeedContext(title));

    return self;
  }

  target<TContext>(title: string): Target<void, TInput>;
  target<TContext>(title: string, setup: SetupFn<Awaited<TContext>>): Target<TContext, TInput>;
  target<TContext>(title: string, setup?: SetupFn<Awaited<TContext>> | undefined): Target<TContext, TInput> {
    const target = new TargetContext<TContext, TInput>(title, setup);
    this.#targets.push(target as TargetContext<unknown, TInput>);

    return new Target<TContext, TInput>(target);
  }

  async execute<R extends readonly ReportType[] = typeof DEFAULT_REPORT_TYPES>(options: Partial<ExecutorOptions<R>> & { progress?: boolean } = {}): Promise<TargetReport<R>[]> {
    const {
      workers = DEFAULT_WORKERS,
      warmupCycles = 20,
      maxCycles = DEFAULT_CYCLES,
      minCycles = 50,
      absThreshold = 1_000,
      relThreshold = 0.02,
      gcObserver = true,
      reportTypes = DEFAULT_REPORT_TYPES as unknown as R,
      progress = false,
      progressInterval = 100,
    } = options;
    if (this.#executed) {
      throw new Error("Benchmark is executed and can't be reused");
    }
    this.#executed = true;
    const benchmarkUrl = (options as unknown as Record<symbol, unknown>)[BENCHMARK_URL];

    const totalBenchmarks = this.#targets.reduce((acc, t) => acc + t.measures.length * this.#feeds.length, 0);
    const progressMap = new Map<string, number>();
    let completedBenchmarks = 0;
    let bar: Progress | null = null;

    if (progress && totalBenchmarks > 0) {
      bar = new Progress('  [:bar] :percent :current/:total :label', {
        total: totalBenchmarks * 100,
        width: 30,
        complete: '=',
        incomplete: ' ',
      });
    }

    const onProgress = progress
      ? (info: ProgressInfo) => {
          progressMap.set(info.id, info.progress);
          const totalProgress = (completedBenchmarks + [...progressMap.values()].reduce((a, b) => a + b, 0)) * 100;
          const label = info.id.length > 30 ? info.id.slice(0, 27) + '...' : info.id;
          bar?.update(totalProgress / (totalBenchmarks * 100), { label });
        }
      : undefined;

    const executor = createExecutor<unknown, TInput, R>({
      workers,
      warmupCycles,
      maxCycles,
      minCycles,
      absThreshold,
      relThreshold,
      gcObserver,
      reportTypes,
      onProgress,
      progressInterval,
      [BENCHMARK_URL]: benchmarkUrl,
    } as Required<ExecutorOptions<R>>);

    const reports: TargetReport<R>[] = [];
    const pendingReports: Promise<void>[] = [];

    try {
      const feedData = await Promise.all(this.#feeds.map(async (feed) => ({ title: feed.title, data: await feed.fn?.() })));
      for (const target of this.#targets) {
        const targetReport: TargetReport<R> = { target: target.title, measures: [] };
        for (const measure of target.measures) {
          const measureReport: MeasureReport<R> = { measure: measure.title, feeds: [] };
          for (const feed of feedData) {
            const id = `${target.title}/${measure.title}/${feed.title}`;
            const feedReport: FeedReport<R> = {
              feed: feed.title,
              data: createExecutorErrorReport<R>('Benchmark did not produce a report'),
            };

            measureReport.feeds.push(feedReport);
            pendingReports.push(
              (async () => {
                try {
                  feedReport.data = await executor.pushAsync<ExecutorReport<R>>({
                    id,
                    setup: target.setup,
                    teardown: target.teardown,
                    pre: measure.pre,
                    run: measure.run,
                    post: measure.post,
                    data: feed.data,
                  });
                } catch (error) {
                  feedReport.data = createExecutorErrorReport<R>(error);
                } finally {
                  progressMap.delete(id);
                  completedBenchmarks++;
                }
              })(),
            );
          }
          targetReport.measures.push(measureReport);
        }
        reports.push(targetReport);
      }

      await Promise.all(pendingReports);

      if (bar) {
        bar.update(1, { label: 'done' });
        bar.terminate();
      }

      return reports;
    } finally {
      executor.kill();
    }
  }
}

export const printSimpleReports = <R extends ReportTypeList>(reports: TargetReport<R>[]) => {
  for (const report of reports) {
    for (const { measure, feeds } of report.measures) {
      console.group('\n', report.target, measure);
      for (const { feed, data } of feeds) {
        const { count, heapUsedKB, dceWarning, error: benchError, ...metrics } = data as Record<string, unknown>;
        if (benchError) {
          console.log(feed, `\x1b[31m[error: ${benchError}]\x1b[0m`);
          continue;
        }
        const output = Object.entries(metrics)
          .map(([key, report]) => `${key}: ${(report as { toString(): string }).toString()}`)
          .join('; ');
        const extras: string[] = [];
        if (heapUsedKB) extras.push(`heap: ${heapUsedKB}KB`);
        if (dceWarning) extras.push('\x1b[33m[DCE warning]\x1b[0m');
        const extrasStr = extras.length > 0 ? ` (${extras.join(', ')})` : '';
        console.log(feed, output + extrasStr);
      }
      console.groupEnd();
    }
  }
};

export const printTableReports = <R extends ReportTypeList>(reports: TargetReport<R>[]) => {
  for (const report of reports) {
    for (const { measure, feeds } of report.measures) {
      console.log('\n', report.target, measure);
      const table: Record<string, unknown> = {};
      for (const { feed, data } of feeds) {
        const { error: benchError } = data as Record<string, unknown>;
        if (benchError) {
          table[feed] = { error: benchError };
        } else {
          table[feed] = Object.fromEntries(Object.entries(data).map(([key, report]) => [key, report.toString()]));
        }
      }
      console.table(table);
    }
  }
};

export const printJSONReports = <R extends ReportTypeList>(reports: TargetReport<R>[], padding?: number) => {
  const output = {} as Record<string, Record<string, Record<string, string>>>;
  for (const report of reports) {
    for (const { measure, feeds } of report.measures) {
      const row = {} as Record<string, Record<string, string>>;
      for (const { feed, data } of feeds) {
        const { error: benchError } = data as Record<string, unknown>;
        if (benchError) {
          row[feed] = { error: String(benchError) };
        } else {
          row[feed] = Object.fromEntries(Object.entries(data).map(([key, report]) => [key, report.toString()]));
        }
      }
      output[`${report.target} ${measure}`] = row;
    }
  }
  console.log(JSON.stringify(output, null, padding));
};

export const printMarkdownReports = <R extends ReportTypeList>(reports: TargetReport<R>[]) => {
  for (const report of reports) {
    for (const { measure, feeds } of report.measures) {
      console.log(`\n## ${report.target} - ${measure}\n`);
      if (feeds.length === 0) continue;

      const firstValid = feeds.find((f) => !(f.data as Record<string, unknown>).error);
      if (!firstValid) {
        for (const { feed, data } of feeds) {
          console.log(`| ${feed} | error: ${(data as Record<string, unknown>).error} |`);
        }
        continue;
      }
      const keys = Object.keys(firstValid.data).filter((k) => k !== 'count' && k !== 'error');
      const header = ['Feed', ...keys].join(' | ');
      const separator = ['---', ...keys.map(() => '---')].join(' | ');

      console.log(`| ${header} |`);
      console.log(`| ${separator} |`);

      for (const { feed, data } of feeds) {
        if ((data as Record<string, unknown>).error) {
          console.log(`| ${feed} | error: ${(data as Record<string, unknown>).error} |`);
          continue;
        }
        const values = keys.map((k) => (data as Record<string, { toString(): string }>)[k]?.toString() ?? '-');
        console.log(`| ${[feed, ...values].join(' | ')} |`);
      }
    }
  }
};

export const printHistogramReports = <R extends ReportTypeList>(reports: TargetReport<R>[], width = 40) => {
  for (const report of reports) {
    for (const { measure, feeds } of report.measures) {
      console.log(`\n${report.target} - ${measure}\n`);

      const opsKey = 'ops';
      const values = feeds.map((f) => {
        const { error: benchError } = f.data as Record<string, unknown>;
        return {
          feed: f.feed,
          value: benchError ? 0 : ((f.data as Record<string, { valueOf(): number }>)[opsKey]?.valueOf() ?? 0),
          error: benchError as string | undefined,
        };
      });

      const maxValue = Math.max(...values.map((v) => v.value));
      const maxLabelLen = Math.max(...values.map((v) => v.feed.length));

      for (const { feed, value, error } of values) {
        const label = feed.padEnd(maxLabelLen);
        if (error) {
          console.log(`  ${label} | \x1b[31m[error: ${error}]\x1b[0m`);
          continue;
        }
        const barLen = maxValue > 0 ? Math.round((value / maxValue) * width) : 0;
        const bar = '\u2588'.repeat(barLen);
        const formatted = value.toLocaleString('en-US', { maximumFractionDigits: 2 });
        console.log(`  ${label} | ${bar} ${formatted} ops/s`);
      }
    }
  }
};

export interface BaselineData {
  version: number;
  timestamp: string;
  results: Record<string, Record<string, number>>;
}

export const reportsToBaseline = <R extends ReportTypeList>(reports: TargetReport<R>[]): BaselineData => {
  const results: Record<string, Record<string, number>> = {};
  for (const report of reports) {
    for (const { measure, feeds } of report.measures) {
      for (const { feed, data } of feeds) {
        if ((data as Record<string, unknown>).error) continue;
        const key = `${report.target}/${measure}/${feed}`;
        results[key] = {};
        for (const [metric, value] of Object.entries(data)) {
          if (metric !== 'count' && typeof (value as { valueOf(): number }).valueOf === 'function') {
            results[key][metric] = (value as { valueOf(): number }).valueOf();
          }
        }
      }
    }
  }
  return {
    version: 1,
    timestamp: new Date().toISOString(),
    results,
  };
};

export const printComparisonReports = <R extends ReportTypeList>(reports: TargetReport<R>[], baseline: BaselineData, threshold = 5) => {
  for (const report of reports) {
    for (const { measure, feeds } of report.measures) {
      console.log(`\n${report.target} - ${measure}\n`);

      for (const { feed, data } of feeds) {
        const key = `${report.target}/${measure}/${feed}`;
        const baselineData = baseline.results[key];

        console.log(`  ${feed}:`);

        if ((data as Record<string, unknown>).error) {
          console.log(`    \x1b[31m[error: ${(data as Record<string, unknown>).error}]\x1b[0m`);
          continue;
        }

        for (const [metric, value] of Object.entries(data)) {
          if (metric === 'count') continue;
          const current = (value as { valueOf(): number }).valueOf();
          const baselineValue = baselineData?.[metric];

          if (baselineValue !== undefined && baselineValue !== 0) {
            const change = ((current - baselineValue) / baselineValue) * 100;
            const isOps = metric === 'ops';
            const improved = isOps ? change > threshold : change < -threshold;
            const regressed = isOps ? change < -threshold : change > threshold;

            let indicator = ' ';
            if (improved) indicator = '\x1b[32m+\x1b[0m';
            else if (regressed) indicator = '\x1b[31m!\x1b[0m';

            const changeStr = change >= 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;
            const coloredChange = regressed ? `\x1b[31m${changeStr}\x1b[0m` : improved ? `\x1b[32m${changeStr}\x1b[0m` : changeStr;

            console.log(`    ${indicator} ${metric}: ${(value as { toString(): string }).toString()} (${coloredChange})`);
          } else {
            console.log(`    * ${metric}: ${(value as { toString(): string }).toString()} (new)`);
          }
        }
      }
    }
  }

  console.log(`\nBaseline from: ${baseline.timestamp}`);
};
