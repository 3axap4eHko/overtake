import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transformSync } from '@swc/core';

export async function resolve(specifier: string, context: unknown, nextResolve: (...args: unknown[]) => unknown) {
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    if (specifier.endsWith('.js'))
      try {
        return await nextResolve(specifier.slice(0, -3) + '.ts', context);
      } catch {}
    throw e;
  }
}

export async function load(url: string, context: unknown, nextLoad: (...args: unknown[]) => unknown) {
  if (!url.endsWith('.ts') && !url.endsWith('.mts')) {
    return nextLoad(url, context);
  }
  const filePath = fileURLToPath(url);
  const rawSource = await readFile(filePath, 'utf-8');
  const { code } = transformSync(rawSource, {
    filename: filePath,
    jsc: {
      parser: { syntax: 'typescript' },
      target: 'esnext',
    },
    module: { type: 'es6' },
    sourceMaps: false,
  });
  return { format: 'module', source: code, shortCircuit: true };
}
