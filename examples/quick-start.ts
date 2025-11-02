// Minimal example - comparing array sum algorithms
// Run: npx overtake examples/quick-start.ts

const sumBenchmark = benchmark('1M numbers', () => Array.from({ length: 1_000_000 }, (_, index) => index));

sumBenchmark.target('for loop').measure('sum', (_, numbers) => {
  let sum = 0;
  for (let i = 0; i < numbers.length; i++) {
    sum += numbers[i];
  }
});

sumBenchmark.target('reduce').measure('sum', (_, numbers) => {
  numbers.reduce((accumulator, current) => accumulator + current, 0);
});
