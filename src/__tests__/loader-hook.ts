import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const overtakeBin = fileURLToPath(new URL('../../bin/overtake.js', import.meta.url));
const nodeFlags = ['--experimental-vm-modules', '--no-warnings', '--expose-gc'];

const runBench = async (fixture: string) => {
  const { stdout } = await exec(process.execPath, [...nodeFlags, overtakeBin, '-f', 'json', '--max-cycles', '50', '--min-cycles', '10', '--warmup-cycles', '5', fixture], {
    timeout: 30_000,
  });

  const result = JSON.parse(stdout);
  const key = Object.keys(result)[0];
  assert.ok(key, 'should have at least one benchmark result');
  const feeds = result[key];
  const feed = Object.keys(feeds)[0];
  assert.ok(feeds[feed].ops, 'should have ops metric');
  assert.ok(!feeds[feed].error, 'should not have an error');
};

describe('loader-hook', () => {
  it('loads benchmark files using parameter properties', async () => {
    await runBench(fileURLToPath(new URL('fixtures/param-property-bench.ts', import.meta.url)));
  });

  it('loads benchmark files using enums', async () => {
    await runBench(fileURLToPath(new URL('fixtures/enum-bench.ts', import.meta.url)));
  });
});
