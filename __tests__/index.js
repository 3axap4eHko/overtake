import Path from 'path';
import { expect, jest } from '@jest/globals';
import { load, benchmark, setup, teardown, measure, perform, run, defaultReporter } from '../index.js';

const TEST_BENCHMARK = Path.resolve('__benchmarks__/test.js');
Object.assign(globalThis, { benchmark, setup, teardown, measure, perform });

describe('Overtake test suite', () => {
  it('Should be exported', () => {
    expect(load).toBeDefined();
    expect(benchmark).toBeDefined();
    expect(setup).toBeDefined();
    expect(teardown).toBeDefined();
    expect(measure).toBeDefined();
    expect(perform).toBeDefined();
    expect(defaultReporter).toBeDefined();
  });

  it('Should load and run a test script', async () => {
    const benchmark = jest.spyOn(globalThis, 'benchmark');
    const setup = jest.spyOn(globalThis, 'setup');
    const teardown = jest.spyOn(globalThis, 'teardown');
    const measure = jest.spyOn(globalThis, 'measure');
    const perform = jest.spyOn(globalThis, 'perform');

    const script = await load(TEST_BENCHMARK);
    expect(script.filename).toEqual(TEST_BENCHMARK);
    expect(script.suites).toHaveLength(1);
    expect(benchmark).toHaveBeenLastCalledWith('Test', expect.any(Function));
    expect(setup).not.toBeCalled();
    expect(teardown).not.toBeCalled();
    expect(measure).not.toBeCalled();
    expect(perform).not.toBeCalled();

    const output = jest.fn();
    const testReporter = jest.fn(async (type, title, test) => {
      await test({ test: testReporter, output });
    });

    const fields = [];
    await run([script], testReporter, fields);
    const anyFn = expect.any(Function);
    expect(testReporter).toBeCalledWith('script', TEST_BENCHMARK, anyFn, []);
    expect(testReporter).toBeCalledWith('suite', 'Test', anyFn);
    expect(testReporter).toBeCalledWith('measure', '1 a', anyFn);
    expect(testReporter).toBeCalledWith('measure', '10 a', anyFn);
    expect(testReporter).toBeCalledWith('measure', '100 a', anyFn);
    expect(testReporter).toBeCalledWith('measure', '1 b', anyFn);
    expect(testReporter).toBeCalledWith('measure', '10 b', anyFn);
    expect(testReporter).toBeCalledWith('measure', '100 b', anyFn);
    expect(testReporter).toBeCalledWith('measure', '1 c', anyFn);
    expect(testReporter).toBeCalledWith('measure', '10 c', anyFn);
    expect(testReporter).toBeCalledWith('measure', '100 c', anyFn);
    expect(testReporter).toBeCalledWith('perform', 'X', anyFn);
    expect(testReporter).toBeCalledWith('perform', 'Y', anyFn);
    expect(testReporter).toBeCalledWith('perform', 'Z', anyFn);

    expect(output).toBeCalledTimes(script.suites[0].measures.length * script.suites[0].performs.length);
  });
});
