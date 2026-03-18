import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('Benchmark.execute', () => {
  it('returns an error report when executor task setup fails', async () => {
    const pushAsync = mock.fn(() => Promise.reject(new Error('Benchmark "run" function references outer-scope variables: port')));
    const kill = mock.fn();

    mock.module('../executor.js', {
      namedExports: {
        createExecutor: () => ({ pushAsync, kill }),
      },
    });

    const { Benchmark } = await import('../index.js');

    const bench = Benchmark.create('feed');
    bench.target('target').measure('run', () => 1);

    const reports = await bench.execute();

    assert.deepStrictEqual(reports, [
      {
        target: 'target',
        measures: [
          {
            measure: 'run',
            feeds: [
              {
                feed: 'feed',
                data: {
                  count: 0,
                  heapUsedKB: 0,
                  dceWarning: false,
                  error: 'Benchmark "run" function references outer-scope variables: port',
                },
              },
            ],
          },
        ],
      },
    ]);
    assert.strictEqual(pushAsync.mock.callCount(), 1);
    assert.strictEqual(kill.mock.callCount(), 1);

    mock.restoreAll();
  });
});
