#!/usr/bin/env node

import { Command } from 'commander';
import { promisify } from 'util';
import Path from 'path';
import glob from 'glob';
import { load, createScript, benchmark, setup, teardown, measure, perform, run, defaultReporter } from './index.js';
import packageJson from './package.json' assert { type: 'json' };

const commands = new Command();

commands.name('overtake').description(packageJson.description).version(packageJson.version, '-v, --version');

commands
  .argument('[files...]', 'file paths or path patterns to search benchmark scripts')
  .option('-i, --inline [inline]', 'inline code to benchmark', (value, previous) => previous.concat([value]), [])
  .option('-c, --count [count]', 'perform count for inline code', (v) => parseInt(v))
  .action(async (patterns, { count = 100, inline }) => {
    Object.assign(globalThis, { benchmark, setup, teardown, measure, perform });

    const globAsync = promisify(glob);
    const foundFiles = await Promise.all(patterns.map((pattern) => globAsync(pattern)));
    const files = [
      ...new Set(
        []
          .concat(...foundFiles)
          .map((filename) => Path.resolve(filename))
          .filter(Boolean)
      ),
    ];

    const scripts = [];
    if (inline.length) {
      const inlineScript = await createScript('', () => {
        benchmark('', () => {
          inline.forEach((code) => {
            measure(code, `() => () => { ${code} }`);
          });
          perform('', count);
        });
      });
      scripts.push(inlineScript);
    }

    for (const file of files) {
      const filename = Path.resolve(file);
      const script = await load(filename);
      scripts.push(script);
    }

    await run(scripts, defaultReporter);
  });

commands.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ overtake **/__benchmarks__/*.js');
  console.log('  $ overtake -i "class A{}" -i "function A(){}" -i "const A = () => {}" -c 1000000');
  console.log('  $ overtake -v');
});

commands.parse(process.argv);

//

//
// (async () => {
//   const files = await globAsync(pattern);
//   const scripts = [];
//   for (const file of files) {
//     const filename = Path.resolve(file);
//     const script = await load(filename);
//     scripts.push(script);
//   }
//
//   await run(scripts, defaultReporter);
// })().catch((e) => console.error(e));
