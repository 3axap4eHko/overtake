import { createRequire, register } from 'node:module';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { stat, readFile, writeFile, glob } from 'node:fs/promises';
import {
  Benchmark,
  printTableReports,
  printJSONReports,
  printSimpleReports,
  printMarkdownReports,
  printHistogramReports,
  printComparisonReports,
  reportsToBaseline,
  type BaselineData,
  DEFAULT_REPORT_TYPES,
  DEFAULT_WORKERS,
} from './index.js';
import { REPORT_TYPES } from './types.js';
import { resolveHookUrl } from './utils.js';

register(resolveHookUrl);

const require = createRequire(import.meta.url);
const { name, version, description } = require('../package.json');
const BENCHMARK_URL = Symbol.for('overtake.benchmarkUrl');

const FORMATS = ['simple', 'json', 'pjson', 'table', 'markdown', 'histogram'] as const;

const { values: opts, positionals: patterns } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    'report-types': { type: 'string', short: 'r', multiple: true },
    workers: { type: 'string', short: 'w' },
    format: { type: 'string', short: 'f' },
    'abs-threshold': { type: 'string' },
    'rel-threshold': { type: 'string' },
    'warmup-cycles': { type: 'string' },
    'max-cycles': { type: 'string' },
    'min-cycles': { type: 'string' },
    'no-gc-observer': { type: 'boolean' },
    progress: { type: 'boolean' },
    'save-baseline': { type: 'string' },
    'compare-baseline': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
});

if (opts.version) {
  console.log(version);
  process.exit(0);
}

if (opts.help || patterns.length === 0) {
  console.log(`${name} v${version} - ${description}

Usage: overtake [options] <paths...>

Options:
  -r, --report-types <type>       statistic type, repeat for multiple (-r ops -r p99)
  -w, --workers <n>               number of concurrent workers (default: ${DEFAULT_WORKERS})
  -f, --format <format>           output format: ${FORMATS.join(', ')} (default: simple)
  --abs-threshold <ns>            absolute error threshold in nanoseconds
  --rel-threshold <frac>          relative error threshold (0-1)
  --warmup-cycles <n>             warmup cycles before measuring
  --max-cycles <n>                maximum measurement cycles per feed
  --min-cycles <n>                minimum measurement cycles per feed
  --no-gc-observer                disable GC overlap detection
  --progress                      show progress bar
  --save-baseline <file>          save results to baseline file
  --compare-baseline <file>       compare results against baseline file
  -v, --version                   show version
  -h, --help                      show this help`);
  process.exit(0);
}

const reportTypes = opts['report-types']?.length
  ? opts['report-types'].filter((t): t is (typeof REPORT_TYPES)[number] => REPORT_TYPES.includes(t as (typeof REPORT_TYPES)[number]))
  : DEFAULT_REPORT_TYPES;
const format = opts.format && FORMATS.includes(opts.format as (typeof FORMATS)[number]) ? opts.format : 'simple';

const executeOptions = {
  reportTypes,
  workers: opts.workers ? parseInt(opts.workers) : DEFAULT_WORKERS,
  absThreshold: opts['abs-threshold'] ? parseFloat(opts['abs-threshold']) : undefined,
  relThreshold: opts['rel-threshold'] ? parseFloat(opts['rel-threshold']) : undefined,
  warmupCycles: opts['warmup-cycles'] ? parseInt(opts['warmup-cycles']) : undefined,
  maxCycles: opts['max-cycles'] ? parseInt(opts['max-cycles']) : undefined,
  minCycles: opts['min-cycles'] ? parseInt(opts['min-cycles']) : undefined,
  gcObserver: !opts['no-gc-observer'],
  progress: opts.progress ?? false,
  format,
};

let baseline: BaselineData | null = null;
if (opts['compare-baseline']) {
  try {
    const content = await readFile(opts['compare-baseline'], 'utf8');
    baseline = JSON.parse(content) as BaselineData;
  } catch {
    console.error(`Warning: Could not load baseline file: ${opts['compare-baseline']}`);
  }
}

const files = new Set((await Promise.all(patterns.map((pattern) => Array.fromAsync(glob(pattern, { cwd: process.cwd() })).catch(() => [] as string[])))).flat());

const allBaselineResults: Record<string, Record<string, number>> = {};

for (const file of files) {
  const stats = await stat(file).catch(() => false as const);
  if (stats && stats.isFile()) {
    const identifier = pathToFileURL(file).href;
    let instance: Benchmark<unknown> | undefined;
    (globalThis as any).benchmark = (...args: Parameters<(typeof Benchmark)['create']>) => {
      if (instance) {
        throw new Error('Only one benchmark per file is supported');
      }
      instance = Benchmark.create(...args);
      return instance;
    };
    try {
      await import(identifier);
    } catch (e) {
      console.error(`Error loading ${file}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (instance) {
      let reports;
      try {
        reports = await instance.execute({
          ...executeOptions,
          [BENCHMARK_URL]: identifier,
        } as typeof executeOptions);
      } catch (e) {
        console.error(`Error executing ${file}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      if (opts['save-baseline']) {
        const bd = reportsToBaseline(reports);
        Object.assign(allBaselineResults, bd.results);
      }

      if (baseline) {
        printComparisonReports(reports, baseline);
      } else {
        switch (format) {
          case 'json':
            printJSONReports(reports);
            break;
          case 'pjson':
            printJSONReports(reports, 2);
            break;
          case 'table':
            printTableReports(reports);
            break;
          case 'markdown':
            printMarkdownReports(reports);
            break;
          case 'histogram':
            printHistogramReports(reports);
            break;
          default:
            printSimpleReports(reports);
        }
      }
    }
  }
}

if (opts['save-baseline'] && Object.keys(allBaselineResults).length > 0) {
  const baselineData: BaselineData = {
    version: 1,
    timestamp: new Date().toISOString(),
    results: allBaselineResults,
  };
  await writeFile(opts['save-baseline'], JSON.stringify(baselineData, null, 2));
  console.log(`Baseline saved to: ${opts['save-baseline']}`);
}
