benchmark('Async functions performance', () => {
  setup(async () => {
    return {
      fn: () => Promise.resolve(),
      asyncFn: async () => Promise.resolve(),
      asyncAwaitFn: async () => await Promise.resolve(),
    };
  });

  measure(
    'calls of function that returns Promise.resolve()',
    ({ fn }, next) =>
      () =>
        fn().then(next),
  );
  measure(
    'calls of async function that returns await Promise.resolve()',
    ({ asyncAwaitFn }, next) =>
      () =>
        asyncAwaitFn().then(next),
  );
  measure(
    'calls of async function that returns Promise.resolve()',
    ({ asyncFn }, next) =>
      () =>
        asyncFn().then(next),
  );

  perform('10000000 calls', 10000000);
});
