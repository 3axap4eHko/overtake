#!/usr/bin/env -S node --no-warnings

import { Command, Option } from 'commander';
import Path from 'path';
import { glob } from 'glob';
import { load, createScript, benchmark, setup, teardown, measure, perform, run, defaultReporter, allowedFields } from './index.js';
import packageJson from './package.json' assert { type: 'json' };

const commands = new Command();

commands.name('overtake').description(packageJson.description).version(packageJson.version, '-v, --version');

commands
  .argument('[files...]', 'File paths or path patterns to search benchmark scripts')
  .option('-i, --inline [inline]', 'Inline benchmark.', (value, previous) => previous.concat([value]), [])
  .option('-c, --count [count]', 'Perform count for inline benchmark.', (v) => parseInt(v))
  .addOption(
    new Option('-f, --fields [fields]', `Comma separated list of fields to report. Allowed values are: ${allowedFields}.`)
      .default(['med', 'p95', 'p99', 'sum:total', 'count'])
      .argParser((fields) =>
        fields.split(',').filter((field) => {
          if (!allowedFields.includes(field)) {
            console.error(`Invalid field name: ${field}. Allowed values are: ${allowedFields.join(', ')}.`);
            process.exit(1);
          }
          return true;
        }),
      ),
  )
  .action(async (patterns, { count = 1, inline, fields }) => {
    Object.assign(globalThis, { benchmark, setup, teardown, measure, perform });

    const foundFiles = await glob(patterns);
    if (!foundFiles.length) {
      console.error(`No files found with patterns ${patterns.join(', ')}`);
      process.exit(1);
    }
    const files = [...new Set(foundFiles.map((filename) => Path.resolve(filename)).filter(Boolean))];

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

    await run(scripts, defaultReporter, fields);
  });

commands.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ overtake **/__benchmarks__/*.js');
  console.log('  $ overtake -i "class A{}" -i "function A(){}" -i "const A = () => {}" -c 1000000');
  console.log('  $ overtake -v');
});

commands.parse(process.argv);
