import { createRequire, Module } from 'node:module';
import { SyntheticModule, createContext, SourceTextModule } from 'node:vm';
import { stat, readFile } from 'node:fs/promises';
import { transform } from '@swc/core';
import { Command, Option } from 'commander';
import { glob } from 'glob';
import { Benchmark, printTableReports, printJSONReports, printSimpleReports, DEFAULT_REPORT_TYPES, DEFAULT_WORKERS } from './index.js';
import { REPORT_TYPES } from './types.js';

const require = createRequire(import.meta.url);
const { name, description, version } = require('../package.json');

const commander = new Command();

const transpile = async (code: string): Promise<string> => {
  const output = await transform(code, {
    filename: 'benchmark.ts',
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: false,
        dynamicImport: true,
      },
      target: 'esnext',
    },
    module: {
      type: 'es6',
    },
  });
  return output.code;
};

commander
  .name(name)
  .description(description)
  .version(version)
  .argument('<path>', 'glob pattern to find benchmarks')
  .addOption(new Option('-r, --report-types [reportTypes...]', 'statistic types to include in the report').choices(REPORT_TYPES).default(DEFAULT_REPORT_TYPES))
  .addOption(new Option('-w, --workers [workers]', 'number of concurent workers').default(DEFAULT_WORKERS).argParser(parseInt))
  .addOption(new Option('-f, --format [format]', 'output format').default('simple').choices(['simple', 'json', 'pjson', 'table']))
  .addOption(new Option('--abs-threshold [absThreshold]', 'absolute error threshold in nanoseconds').argParser(parseInt))
  .addOption(new Option('--rel-threshold [relThreshold]', 'relative error threshold (fraction between 0 and 1)').argParser(parseInt))
  .addOption(new Option('--warmup-cycles [warmupCycles]', 'number of warmup cycles before measuring').argParser(parseInt))
  .addOption(new Option('--max-cycles [maxCycles]', 'maximum measurement cycles per feed').argParser(parseInt))
  .addOption(new Option('--min-cycles [minCycles]', 'minimum measurement cycles per feed').argParser(parseInt))
  .action(async (path, executeOptions) => {
    const files = await glob(path, { absolute: true, cwd: process.cwd() }).catch(() => []);
    for (const file of files) {
      const stats = await stat(file).catch(() => false as const);
      if (stats && stats.isFile()) {
        const content = await readFile(file, 'utf8');
        const code = await transpile(content);
        let instance: Benchmark<unknown> | undefined;
        const benchmark = (...args: Parameters<(typeof Benchmark)['create']>) => {
          if (instance) {
            throw new Error('Only one benchmark per file is supported');
          }
          instance = Benchmark.create(...args);
          return instance;
        };
        const script = new SourceTextModule(code, {
          context: createContext({
            benchmark,
            Buffer,
          }),
        });
        const imports = new Map();
        await script.link(async (specifier: string, referencingModule) => {
          if (imports.has(specifier)) {
            return imports.get(specifier);
          }
          const mod = await import(Module.isBuiltin(specifier) ? specifier : require.resolve(specifier));
          const exportNames = Object.keys(mod);
          const imported = new SyntheticModule(
            exportNames,
            () => {
              exportNames.forEach((key) => imported.setExport(key, mod[key]));
            },
            { identifier: specifier, context: referencingModule.context },
          );

          imports.set(specifier, imported);
          return imported;
        });
        await script.evaluate();

        if (instance) {
          const reports = await instance.execute(executeOptions);
          switch (executeOptions.format) {
            case 'json':
              {
                printJSONReports(reports);
              }
              break;
            case 'pjson':
              {
                printJSONReports(reports, 2);
              }
              break;
            case 'table':
              {
                printTableReports(reports);
              }
              break;
            default:
              printSimpleReports(reports);
          }
        }
      }
    }
  });

commander.parse(process.argv);
