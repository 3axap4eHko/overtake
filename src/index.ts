import { cpus } from 'node:os';
import Progress from 'progress';
import { createExecutor, ExecutorOptions, ExecutorReport } from './executor.js';
import { MaybePromise, StepFn, SetupFn, TeardownFn, FeedFn, ReportType, ReportTypeList, DEFAULT_CYCLES, ProgressInfo } from './types.js';

declare global {
  const benchmark: typeof Benchmark.create;
}

export const DEFAULT_WORKERS = cpus().length;

export const AsyncFunction = (async () => {}).constructor;
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

export class MeasureContext<TContext, TInput> {
  public pre?: StepFn<TContext, TInput>;
  public post?: StepFn<TContext, TInput>;

  constructor(
    public title: string,
    public run: StepFn<TContext, TInput>,
  ) {}
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
  public teardown?: TeardownFn<TContext>;
  public measures: MeasureContext<TContext, TInput>[] = [];

  constructor(
    readonly title: string,
    readonly setup?: SetupFn<MaybePromise<TContext>>,
  ) {}
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
  constructor(
    readonly title: string,
    readonly fn?: FeedFn<TInput>,
  ) {}
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

  async execute<R extends readonly ReportType[] = typeof DEFAULT_REPORT_TYPES>(options: ExecutorOptions<R> & { progress?: boolean }): Promise<TargetReport<R>[]> {
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
    for (const target of this.#targets) {
      const targetReport: TargetReport<R> = { target: target.title, measures: [] };
      for (const measure of target.measures) {
        const measureReport: MeasureReport<R> = { measure: measure.title, feeds: [] };
        for (const feed of this.#feeds) {
          const id = `${target.title}/${measure.title}/${feed.title}`;
          const data = await feed.fn?.();
          executor
            .push<ExecutorReport<R>>({
              id,
              setup: target.setup,
              teardown: target.teardown,
              pre: measure.pre,
              run: measure.run,
              post: measure.post,
              data,
            })
            .then((data) => {
              progressMap.delete(id);
              completedBenchmarks++;
              measureReport.feeds.push({
                feed: feed.title,
                data,
              });
            });
        }
        targetReport.measures.push(measureReport);
      }
      reports.push(targetReport);
    }
    await executor.drain();
    executor.kill();

    if (bar) {
      bar.update(1, { label: 'done' });
      bar.terminate();
    }

    return reports;
  }
}

export const printSimpleReports = <R extends ReportTypeList>(reports: TargetReport<R>[]) => {
  for (const report of reports) {
    for (const { measure, feeds } of report.measures) {
      console.group('\n', report.target, measure);
      for (const { feed, data } of feeds) {
        const output = Object.entries(data)
          .map(([key, report]) => `${key}: ${report.toString()}`)
          .join('; ');
        console.log(feed, output);
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
        table[feed] = Object.fromEntries(Object.entries(data).map(([key, report]) => [key, report.toString()]));
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
        row[feed] = Object.fromEntries(Object.entries(data).map(([key, report]) => [key, report.toString()]));
      }
      output[`${report.target} ${measure}`] = row;
    }
  }
  console.log(JSON.stringify(output, null, padding));
};
