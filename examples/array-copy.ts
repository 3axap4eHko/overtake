const suite = benchmark('1M array of strings', () => Array.from({ length: 1_000_000 }, (_, idx) => `${idx}`))
  .feed('1M array of numbers', () => Array.from({ length: 1_000_000 }, (_, idx) => idx))
  .feed('1M typed array', () => new Uint32Array(1_000_000).map((_, idx) => idx));

suite.target('for loop').measure('copy half', (_, input) => {
  const n = input?.length ?? 0;
  const mid = n / 2;
  for (let i = 0; i < mid; i++) {
    input[i + mid] = input[i];
  }
});

suite.target('copyWithin').measure('copy half', (_, input) => {
  const n = input?.length ?? 0;
  const mid = n / 2;
  input.copyWithin(mid, 0, mid);
});
