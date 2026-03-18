import { register } from 'node:module';

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

register('data:text/javascript,' + encodeURIComponent(`export ${resolve.toString()}`));
