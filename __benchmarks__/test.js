benchmark('Test', () => {
  setup(() => {});

  measure('a', async () => {
    return () => {};
  });
  measure('b', async (next) => {
    return () => next();
  });
  measure('c', async (context, next) => {
    return () => next();
  });
  measure('d', async (context, input, next) => {
    return () => next();
  });

  teardown(() => {});

  perform('X', 1, [[]]);
  perform('Y', 10, [[]]);
  perform('Z', 100, [[]]);
});
