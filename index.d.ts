import { Event } from 'evnty';

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
    med: number;
    mode: number;
    p90: number;
    p95: number;
    p99: number;
    setup: number;
    init: number;
    cycles: number;
    teardown: number;
    total: number;
  }

  interface Overtake {
    onLoad: Event<any>;

    onRun: Event<any>;

    onComplete: Event<any>;

    onScriptRegister: Event<any>;

    onScriptStart: Event<any>;

    onScriptComplete: Event<any>;

    onSuiteRegister: Event<any>;

    onSuiteStart: Event<any>;

    onSuiteComplete: Event<any>;

    onSetupRegister: Event<any>;

    onTeardownRegister: Event<any>;

    onMeasureRegister: Event<any>;

    onMeasureStart: Event<any>;

    onMeasureComplete: Event<any>;

    onPerformRegister: Event<any>;

    onPerformStart: Event<any>;

    onPerformProgress: Event<any>;

    onPerformComplete: Event<any>;

    onReport: Event<Report>;
  }

  function benchmark(title: string, init: () => void): void;

  function setup<C>(init: () => CanBePromise<C>): any;

  function teardown<C>(teardown: (context: C) => CanBePromise<void>): void;

  type MeasureInitResult = CanBePromise<() => void>;

  function measure(title: string, init: () => MeasureInitResult): void;
  function measure(title: string, init: (next: () => void) => MeasureInitResult): void;
  function measure<C>(title: string, init: (context: C, next: () => void) => MeasureInitResult): void;
  function measure<C, A>(title: string, init: (context: C, args: A, next: () => void) => MeasureInitResult): void;

  function perform<A>(title: string, counter: number, args: A): void;

  function reporter(reporter: (overtake: Overtake) => void): void;
}
