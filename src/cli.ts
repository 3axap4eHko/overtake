import { createRequire, Module } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SyntheticModule, createContext, SourceTextModule } from 'node:vm';
import { stat, readFile } from 'node:fs/promises';
import { Command, Option } from 'commander';
import { glob } from 'glob';
import { Benchmark, printTableReports, printJSONReports, printSimpleReports, DEFAULT_REPORT_TYPES, DEFAULT_WORKERS } from './index.js';
import { transpile } from './utils.js';
import { REPORT_TYPES } from './types.js';

const require = createRequire(import.meta.url);
const { name, description, version } = require('../package.json');
const BENCHMARK_URL = Symbol.for('overtake.benchmarkUrl');

const commander = new Command();

commander
  .name(name)
  .description(description)
  .version(version)
  .argument('<paths...>', 'glob pattern to find benchmarks')
  .addOption(new Option('-r, --report-types [reportTypes...]', 'statistic types to include in the report').choices(REPORT_TYPES).default(DEFAULT_REPORT_TYPES))
  .addOption(new Option('-w, --workers [workers]', 'number of concurent workers').default(DEFAULT_WORKERS).argParser(parseInt))
  .addOption(new Option('-f, --format [format]', 'output format').default('simple').choices(['simple', 'json', 'pjson', 'table']))
  .addOption(new Option('--abs-threshold [absThreshold]', 'absolute error threshold in nanoseconds').argParser(parseFloat))
  .addOption(new Option('--rel-threshold [relThreshold]', 'relative error threshold (fraction between 0 and 1)').argParser(parseFloat))
  .addOption(new Option('--warmup-cycles [warmupCycles]', 'number of warmup cycles before measuring').argParser(parseInt))
  .addOption(new Option('--max-cycles [maxCycles]', 'maximum measurement cycles per feed').argParser(parseInt))
  .addOption(new Option('--min-cycles [minCycles]', 'minimum measurement cycles per feed').argParser(parseInt))
  .addOption(new Option('--no-gc-observer', 'disable GC overlap detection'))
  .addOption(new Option('--progress', 'show progress bar during benchmark execution'))
  .action(async (patterns: string[], executeOptions) => {
    const files = new Set<string>();
    await Promise.all(
      patterns.map(async (pattern) => {
        const matches = await glob(pattern, { absolute: true, cwd: process.cwd() }).catch(() => []);
        matches.forEach((file) => files.add(file));
      }),
    );

    for (const file of files) {
      const stats = await stat(file).catch(() => false as const);
      if (stats && stats.isFile()) {
        const content = await readFile(file, 'utf8');
        const identifier = pathToFileURL(file).href;
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
          identifier,
          context: createContext({
            benchmark,
            Buffer,
            console,
          }),
          initializeImportMeta(meta) {
            meta.url = identifier;
          },
          async importModuleDynamically(specifier, referencingModule) {
            if (Module.isBuiltin(specifier)) {
              return import(specifier);
            }
            const baseIdentifier = referencingModule.identifier ?? identifier;
            const resolveFrom = createRequire(fileURLToPath(baseIdentifier));
            const resolved = resolveFrom.resolve(specifier);
            return import(resolved);
          },
        });
        const imports = new Map<string, SyntheticModule>();
        await script.link(async (specifier: string, referencingModule) => {
          const baseIdentifier = referencingModule.identifier ?? identifier;
          const resolveFrom = createRequire(fileURLToPath(baseIdentifier));
          const target = Module.isBuiltin(specifier) ? specifier : resolveFrom.resolve(specifier);
          const cached = imports.get(target);
          if (cached) {
            return cached;
          }
          const mod = await import(target);
          const exportNames = Object.keys(mod);
          const imported = new SyntheticModule(
            exportNames,
            () => {
              exportNames.forEach((key) => imported.setExport(key, mod[key]));
            },
            { identifier: target, context: referencingModule.context },
          );

          imports.set(target, imported);
          return imported;
        });
        await script.evaluate();

        if (instance) {
          const reports = await instance.execute({
            ...executeOptions,
            [BENCHMARK_URL]: identifier,
          } as typeof executeOptions);
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
