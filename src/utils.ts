import { parseSync } from '@swc/core';

async function resolve(s: string, c: unknown, n: (...args: unknown[]) => unknown) {
  try {
    return await n(s, c);
  } catch (e) {
    if (s.endsWith('.js'))
      try {
        return await n(s.slice(0, -3) + '.ts', c);
      } catch {}
    throw e;
  }
}

export const resolveHookUrl = 'data:text/javascript,' + encodeURIComponent(`export ${resolve.toString()}`);

export const isqrt = (n: bigint): bigint => {
  if (n < 0n) throw new RangeError('Square root of negative');
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
};

export const cmp = (a: bigint | number, b: bigint | number): number => {
  if (a > b) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  return 0;
};

export const max = (a: bigint, b: bigint) => {
  if (a > b) {
    return a;
  }
  return b;
};

export function div(a: bigint, b: bigint, decimals: number = 2): string {
  if (b === 0n) throw new RangeError('Division by zero');
  const scale = 10n ** BigInt(decimals);
  const scaled = (a * scale) / b;
  const intPart = scaled / scale;
  const fracPart = scaled % scale;
  return `${intPart}.${fracPart.toString().padStart(decimals, '0')}`;
}

export function divs(a: bigint, b: bigint, scale: bigint): bigint {
  if (b === 0n) throw new RangeError('Division by zero');
  return (a * scale) / b;
}

const KNOWN_GLOBALS = new Set(Object.getOwnPropertyNames(globalThis));
KNOWN_GLOBALS.add('arguments');

function collectUnresolved(node: unknown, result: Set<string>) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectUnresolved(item, result);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.type === 'Identifier' && obj.ctxt === 1 && typeof obj.value === 'string') {
    result.add(obj.value);
  }
  for (const key of Object.keys(obj)) {
    if (key === 'span') continue;
    collectUnresolved(obj[key], result);
  }
}

export function assertNoClosure(code: string, name: string): void {
  let ast;
  try {
    ast = parseSync(`var __fn = ${code}`, { syntax: 'ecmascript', target: 'esnext' });
  } catch {
    return;
  }
  const unresolved = new Set<string>();
  collectUnresolved(ast, unresolved);
  for (const g of KNOWN_GLOBALS) unresolved.delete(g);
  if (unresolved.size === 0) return;

  const vars = [...unresolved].join(', ');
  throw new Error(
    `Benchmark "${name}" function references outer-scope variables: ${vars}\n\n` +
      `Benchmark functions are serialized with .toString() and executed in an isolated\n` +
      `worker thread. Closed-over variables from the original module scope are not\n` +
      `available in the worker and will cause a ReferenceError at runtime.\n\n` +
      `To fix this, move the referenced values into:\n` +
      `  - "setup" function (returned value becomes the first argument of run/pre/post)\n` +
      `  - "data" option (passed as the second argument of run/pre/post)`,
  );
}
