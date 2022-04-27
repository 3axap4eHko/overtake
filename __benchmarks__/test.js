benchmark('Test', () => {
  setup(() => {});

  measure('a', async (next) => {
    return () => next();
  });
  measure('b', async (context, next) => {
    return () => next();
  });
  measure('c', async (context, input, next) => {
    return () => next();
  });

  teardown(() => {});

  perform('X', 1, [[]]);
  perform('Y', 10, [[]]);
  perform('Z', 100, [[]]);
});
