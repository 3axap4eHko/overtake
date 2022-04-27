declare global {
  type CanBePromise<T> = Promise<T> | T;

  interface Report {
    type: string;
    success: boolean;
    count: number;
    min: number;
    max: number;
    sum: number;
    avg: number;
    mode: number;
    p1: number;
    p5: number;
    p20: number;
    p33: number;
    p50: number;
    med: number;
    p66: number;
    p80: number;
    p90: number;
    p95: number;
    p99: number;
    setup: number;
    init: number;
    cycles: number;
    teardown: number;
    total: number;
  }

  type MeasureInitResult = CanBePromise<() => void>;

  function measure(title: string, init: () => MeasureInitResult): void;
  function measure(title: string, init: (next: () => void) => MeasureInitResult): void;
  function measure<C>(title: string, init: (context: C, next: () => void) => MeasureInitResult): void;
  function measure<C, A>(title: string, init: (context: C, args: A, next: () => void) => MeasureInitResult): void;

  function perform<A>(title: string, counter: number, args: A): void;

  function setup<C>(init: () => CanBePromise<C>): void;

  function teardown<C>(teardown: (context: C) => CanBePromise<void>): void;

  interface Suite {
    title: string;
    setup: typeof setup;
    teardown: typeof teardown;
    measures: typeof measure[];
    performs: typeof perform[];
    init: () => void;
  }

  function benchmark(title: string, init: () => void): void;

  function script(filename): Promise<Suite[]>;
}
