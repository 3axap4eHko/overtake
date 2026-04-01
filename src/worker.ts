import { workerData } from 'node:worker_threads';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { createRequire, register } from 'node:module';
import { isAbsolute } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { benchmark } from './runner.js';
import { type WorkerOptions } from './types.js';
import { resolveHookUrl } from './utils.js';

register(resolveHookUrl);

const {
  benchmarkUrl,
  setupCode,
  teardownCode,
  preCode,
  runCode,
  postCode,
  data,
  cpuPin,

  warmupCycles,
  minCycles,
  absThreshold,
  relThreshold,
  gcObserver = true,

  durationsSAB,
  controlSAB,
}: WorkerOptions = workerData;

if (cpuPin !== undefined && process.platform === 'linux') {
  try {
    const status = readFileSync('/proc/thread-self/status', 'utf8');
    const tid = status.match(/^Pid:\t(\d+)/m)?.[1];
    if (tid) {
      execFileSync('taskset', ['-cp', String(cpuPin), tid], { stdio: 'ignore' });
    }
  } catch {}
}

const serialize = (code?: string) => (code ? code : 'undefined');

const resolvedBenchmarkUrl = typeof benchmarkUrl === 'string' ? benchmarkUrl : pathToFileURL(process.cwd()).href;
const benchmarkDirUrl = new URL('.', resolvedBenchmarkUrl).href;
const requireFrom = createRequire(fileURLToPath(new URL('benchmark.js', benchmarkDirUrl)));

const resolveSpecifier = (specifier: string) => {
  if (specifier.startsWith('file:')) {
    return specifier;
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return new URL(specifier, benchmarkDirUrl).href;
  }
  if (isAbsolute(specifier)) {
    return pathToFileURL(specifier).href;
  }
  try {
    return requireFrom.resolve(specifier);
  } catch {
    return specifier;
  }
};

const source = `
export const setup = ${serialize(setupCode)};
export const teardown = ${serialize(teardownCode)};
export const pre = ${serialize(preCode)};
export const run = ${serialize(runCode)};
export const post = ${serialize(postCode)};
  `;

const imports = new Map<string, SyntheticModule>();

const createSyntheticModule = (moduleExports: unknown, exportNames: string[], identifier: string) => {
  const mod = new SyntheticModule(
    exportNames,
    () => {
      for (const name of exportNames) {
        if (name === 'default') {
          mod.setExport(name, moduleExports);
          continue;
        }
        mod.setExport(name, (moduleExports as Record<string, unknown>)[name]);
      }
    },
    { identifier },
  );
  return mod;
};

const isCjsModule = (target: string) => target.endsWith('.cjs') || target.endsWith('.cts');

const toRequireTarget = (target: string) => (target.startsWith('file:') ? fileURLToPath(target) : target);

const loadModule = async (target: string) => {
  const cached = imports.get(target);
  if (cached) return cached;

  if (isCjsModule(target)) {
    const required = requireFrom(toRequireTarget(target));
    const exportNames = required && (typeof required === 'object' || typeof required === 'function') ? Object.keys(required) : [];
    if (!exportNames.includes('default')) {
      exportNames.push('default');
    }
    const mod = createSyntheticModule(required, exportNames, target);
    imports.set(target, mod);
    return mod;
  }

  const importedModule = await import(target);
  const exportNames = Object.keys(importedModule);
  const mod = createSyntheticModule(importedModule, exportNames, target);
  imports.set(target, mod);
  return mod;
};

const loadDynamicModule = async (target: string) => {
  const mod = await loadModule(target);
  if (mod.status !== 'evaluated') {
    await mod.evaluate();
  }
  return mod;
};
const mod = new SourceTextModule(source, {
  identifier: resolvedBenchmarkUrl,
  initializeImportMeta(meta) {
    meta.url = resolvedBenchmarkUrl;
  },
  importModuleDynamically(specifier) {
    const resolved = resolveSpecifier(specifier);
    return loadDynamicModule(resolved);
  },
});

await mod.link(async (specifier) => loadModule(resolveSpecifier(specifier)));

await mod.evaluate();
const { setup, teardown, pre, run, post } = mod.namespace as any;

if (!run) {
  throw new Error('Benchmark run function is required');
}

process.exitCode = await benchmark({
  setup,
  teardown,
  pre,
  run,
  post,
  data,

  warmupCycles,
  minCycles,
  absThreshold,
  relThreshold,
  gcObserver,

  durationsSAB,
  controlSAB,
});
