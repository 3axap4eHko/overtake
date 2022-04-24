import { jest } from '@jest/globals';
import { benchmark, setup, teardown, measure, perform, suites } from '../index.js';

describe('Overtake test suite', () => {
  it('should create a benchmark suite', () => {
    expect(suites.length).toEqual(0);

    const setupInit = jest.fn(() => {});
    const teardowmInit = jest.fn(() => {});

    const measureTitle = 'measure';
    const measureInit = jest.fn(() => {});

    const performTitle = 'perform';
    const performCount = 12345;
    const performArgs = [['test']];

    const benchmarkTitle = 'benchmark';
    const benchmarkInit = jest.fn(() => {
      setup(setupInit);
      measure(measureTitle, measureInit);
      teardown(teardowmInit);
      perform(performTitle, performCount, performArgs);
    });

    benchmark(benchmarkTitle, benchmarkInit);

    expect(benchmarkInit).toHaveBeenCalledTimes(1);
    expect(suites.length).toEqual(1);

    const suite = suites[0];
    expect(suite).toMatchObject({
      title: benchmarkTitle,
      current: false,
      measures: [
        expect.objectContaining({
          title: measureTitle,
          init: measureInit,
        }),
      ],
      performs: [
        expect.objectContaining({
          title: performTitle,
          count: performCount,
          args: performArgs,
        }),
      ],
      setup: setupInit,
      teardown: teardowmInit,
    });
  });
});
