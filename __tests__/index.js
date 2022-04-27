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

    await run([script], testReporter);
    const anyFn = expect.any(Function);
    expect(testReporter).toBeCalledWith('script', TEST_BENCHMARK, anyFn);
    expect(testReporter).toBeCalledWith('suite', 'Test', anyFn);
    expect(testReporter).toBeCalledWith('measure', 'a', anyFn);
    expect(testReporter).toBeCalledWith('measure', 'b', anyFn);
    expect(testReporter).toBeCalledWith('measure', 'c', anyFn);
    expect(testReporter).toBeCalledWith('perform', 'X', anyFn);
    expect(testReporter).toBeCalledWith('perform', 'Y', anyFn);
    expect(testReporter).toBeCalledWith('perform', 'Z', anyFn);

    expect(output).toBeCalledTimes(3 * 3);
  });
});
