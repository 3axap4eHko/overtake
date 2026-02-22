import { workerData } from 'node:worker_threads';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { createRequire } from 'node:module';
import { isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { benchmark } from './runner.js';
import { WorkerOptions } from './types.js';

const {
  benchmarkUrl,
  setupCode,
  teardownCode,
  preCode,
  runCode,
  postCode,
  data,

  warmupCycles,
  minCycles,
  absThreshold,
  relThreshold,
  gcObserver = true,

  durationsSAB,
  controlSAB,
}: WorkerOptions = workerData;

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
  return requireFrom.resolve(specifier);
};

const source = `
export const setup = ${serialize(setupCode)};
export const teardown = ${serialize(teardownCode)};
export const pre = ${serialize(preCode)};
export const run = ${serialize(runCode)};
export const post = ${serialize(postCode)};
  `;

const globals = Object.create(null);
for (const k of Object.getOwnPropertyNames(globalThis)) {
  globals[k] = (globalThis as any)[k];
}
const context = createContext(globals);
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
    { identifier, context },
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
  context,
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
