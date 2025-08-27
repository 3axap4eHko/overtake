// run using the following command
// npx overtake examples/quick-start.ts

const sumSuite = benchmark('1M array', () => Array.from({ length: 1_000_000 }, (_, idx) => idx));

sumSuite.target('for loop').measure('sum', (_, input) => {
  const n = input.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += input[i];
  }
});

sumSuite.target('reduce').measure('sum', (_, input) => {
  input.reduce((a, b) => a + b, 0);
});
