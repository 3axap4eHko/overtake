import Path from 'path';
import { expect, jest } from '@jest/globals';
import { Overtake, NOOP, Script } from '../index.js';

const TEST_BENCHMARK = '__benchmarks__/test.js';

describe('Overtake test suite', () => {
  it('Should be exported', () => {
    expect(Overtake).toBeDefined();
  });

  it('Should create an instance and register globals', () => {
    const overtake = new Overtake();
    expect(overtake).toBeDefined();
    expect(benchmark).toBeDefined();
    expect(setup).toBeDefined();
    expect(teardown).toBeDefined();
    expect(measure).toBeDefined();
    expect(perform).toBeDefined();
    expect(reporter).toBeDefined();
  });

  it('Should load and run test script', async () => {
    const overtake = new Overtake();

    expect(overtake.scripts.length).toEqual(0);

    const benchmark = jest.spyOn(globalThis, 'benchmark');
    const setup = jest.spyOn(globalThis, 'setup');
    const teardown = jest.spyOn(globalThis, 'teardown');
    const measure = jest.spyOn(globalThis, 'measure');
    const perform = jest.spyOn(globalThis, 'perform');
    const reporter = jest.spyOn(globalThis, 'reporter');

    await overtake.load([TEST_BENCHMARK]);

    expect(overtake.scripts.length).toEqual(1);
    expect(benchmark).toHaveBeenLastCalledWith('Test', expect.any(Function));
    expect(setup).not.toBeCalled();
    expect(teardown).not.toBeCalled();
    expect(measure).not.toBeCalled();
    expect(perform).not.toBeCalled();
    expect(reporter).not.toBeCalled();

    const onReport = jest.fn();
    const mockReporter = jest.fn((o) => {
      o.onReport.on(onReport);
    });
    reporter(mockReporter);

    expect(overtake).toMatchObject({
      scripts: [
        expect.objectContaining({
          filename: Path.join(process.cwd(), TEST_BENCHMARK),
          suites: [
            expect.objectContaining({
              title: 'Test',
              setup: NOOP,
              measures: [],
              performs: [],
              teardown: NOOP,
            }),
          ],
        }),
      ],
    });

    await overtake.run();
    expect(setup).toBeCalled();
    expect(teardown).toBeCalled();
    expect(measure).toBeCalled();
    expect(perform).toBeCalled();
    expect(mockReporter).toBeCalled();
  });
});
