export type MaybePromise<T> = Promise<T> | PromiseLike<T> | T;

export interface SetupFn<TContext> {
  (): MaybePromise<TContext>;
}

export interface TeardownFn<TContext> {
  (ctx: TContext): MaybePromise<void>;
}

export interface StepFn<TContext, TInput> {
  (ctx: TContext, input: TInput): MaybePromise<unknown>;
}

export interface FeedFn<TInput> {
  (): MaybePromise<TInput>;
}

type _Sequence<To extends number, R extends unknown[]> = R['length'] extends To ? R[number] : _Sequence<To, [R['length'], ...R]>;
export type Sequence<To extends number> = number extends To ? number : _Sequence<To, []>;
export type Between<From extends number, To extends number> = Exclude<Sequence<To>, Sequence<From>>;

export type ReportType = 'ops' | 'min' | 'max' | 'mean' | 'median' | 'mode' | `p${Between<1, 100>}`;
export type ReportTypeList = readonly ReportType[];
export const REPORT_TYPES: ReportTypeList = Array.from({ length: 99 }, (_, idx) => `p${idx + 1}` as ReportType).concat(['ops', 'mean', 'min', 'max', 'median', 'mode']);

export interface ReportOptions<R extends ReportTypeList> {
  reportTypes: R;
}

export interface BenchmarkOptions {
  warmupCycles?: number;
  minCycles?: number;
  absThreshold?: number; // ns
  relThreshold?: number; // %
  gcObserver?: boolean;
}

export interface RunOptions<TContext, TInput> {
  setup?: SetupFn<TContext>;
  teardown?: TeardownFn<TContext>;
  pre?: StepFn<TContext, TInput>;
  run: StepFn<TContext, TInput>;
  post?: StepFn<TContext, TInput>;
  data?: TInput;
}

export interface WorkerOptions extends Required<BenchmarkOptions> {
  benchmarkUrl?: string;
  setupCode?: string;
  teardownCode?: string;
  preCode?: string;
  runCode: string;
  postCode?: string;
  data?: unknown;

  durationsSAB: SharedArrayBuffer;
  controlSAB: SharedArrayBuffer;
}

export interface Options<TContext, TInput> extends RunOptions<TContext, TInput>, BenchmarkOptions {
  durationsSAB: SharedArrayBuffer;
  controlSAB: SharedArrayBuffer;
}

export enum Control {
  INDEX,
  PROGRESS,
  COMPLETE,
}

export const CONTROL_SLOTS = Object.values(Control).length / 2;
export const DEFAULT_CYCLES = 1_000;
export const Z95 = 1.96;
export const DURATION_SCALE = 1000n;
