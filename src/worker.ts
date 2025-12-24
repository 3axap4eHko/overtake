import { workerData } from 'node:worker_threads';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { benchmark } from './runner.js';
import { WorkerOptions } from './types.js';

const {
  baseUrl,
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

const serialize = (code?: string) => (code ? code : '() => {}');

const isCjs = typeof require !== 'undefined';

const resolveSpecifier = (specifier: string, parent: string) => {
  if (!isCjs) {
    try {
      return import.meta.resolve(specifier, parent);
    } catch {
      // fall through to CommonJS resolution
    }
  }
  const resolveFrom = createRequire(fileURLToPath(parent));
  return resolveFrom.resolve(specifier);
};

const source = `
export const setup = ${serialize(setupCode)};
export const teardown = ${serialize(teardownCode)};
export const pre = ${serialize(preCode)};
export const run = ${serialize(runCode)};
export const post = ${serialize(postCode)};
  `;

const context = createContext({ console, Buffer });
const imports = new Map<string, SyntheticModule>();
const mod = new SourceTextModule(source, {
  identifier: baseUrl,
  context,
  initializeImportMeta(meta) {
    meta.url = baseUrl;
  },
  importModuleDynamically(specifier, referencingModule) {
    const base = referencingModule.identifier ?? baseUrl;
    const resolved = resolveSpecifier(specifier, base);
    return import(resolved);
  },
});

await mod.link(async (specifier, referencingModule) => {
  const base = referencingModule.identifier ?? baseUrl;
  const target = resolveSpecifier(specifier, base);
  const cached = imports.get(target);
  if (cached) return cached;

  const importedModule = await import(target);
  const exportNames = Object.keys(importedModule);
  const imported = new SyntheticModule(
    exportNames,
    () => {
      exportNames.forEach((key) => imported.setExport(key, importedModule[key]));
    },
    { identifier: target, context: referencingModule.context },
  );
  imports.set(target, imported);
  return imported;
});

await mod.evaluate();
const { setup, teardown, pre, run, post } = mod.namespace as any;

if (!run) {
  throw new Error('Benchmark run function is required');
}

process.exitCode = await benchmark({
  baseUrl,
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
