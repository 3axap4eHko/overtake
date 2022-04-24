declare global {
  declare function benchmark(title: string, init: () => void): void;

  declare function setup<C>(init: () => C): any;

  declare function teardown<C>(teardown: (context: C) => void): void;

  declare function measure(title: string, init: (next: () => void) => void): void;
  declare function measure<C>(title: string, init: (context: C, next: () => void) => void): void;
  declare function measure<C, A>(title: string, init: (context: C, args: A, next: () => void) => void): void;

  declare function perform<A>(title: string, counter: number, args: A): void;
}

export { benchmark, setup, teardown, measure, perform };
