import { Benchmark, printSimpleReports } from '../build/index.js';

const benchmark = new Benchmark('1K array of objects', () => Array.from({ length: 1_000 }, (_, idx) => ({ [idx]: idx })));

benchmark.target('reduce destructure').measure('data', (_, input) => {
  input.reduce((acc, obj) => {
    return { ...acc, ...obj };
  }, {});
});

benchmark.target('reduce assign').measure('data', (_, input) => {
  input.reduce((acc, obj) => {
    Object.assign(acc, obj);
    return acc;
  }, {});
});

benchmark.target('forEach assign').measure('data', (_, input) => {
  const result = {};
  input.forEach((obj) => {
    Object.assign(result, obj);
  });
});

benchmark.target('for assign').measure('data', (_, input) => {
  const result = {};
  for (let i = 0; i < input.length; i++) {
    Object.assign(result, input[i]);
  }
});

benchmark.target('assign').measure('data', (_, input) => {
  Object.assign({}, ...input);
});

const reports = await benchmark.execute({
  reportTypes: ['ops'],
  maxCycles: 10_000,
});

printSimpleReports(reports);
