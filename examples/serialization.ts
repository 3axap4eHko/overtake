import { randomUUID } from 'node:crypto';

const serializeSuite = benchmark('1K strings', () => Array.from({ length: 10_000 }, () => randomUUID()));

const v8Target = serializeSuite.target('V8', async () => {
  const { serialize, deserialize } = await import('node:v8');
  const gcBlock = new Set();
  return { serialize, deserialize, gcBlock };
});

v8Target.measure('serialize', ({ serialize, gcBlock }, input) => {
  gcBlock.add(serialize(input));
});

serializeSuite
  .target('JSON', () => {
    const gcBlock = new Set();
    return { gcBlock };
  })
  .measure('serialize', ({ gcBlock }, input) => {
    gcBlock.add(JSON.stringify(input));
  });
