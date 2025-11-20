// Demonstrates correct import patterns for worker context
// Run: npx overtake examples/imports.ts
import 'overtake';

const importExamples = benchmark('test data', () => Buffer.from('hello world'));

// Node built-in modules work normally
importExamples
  .target('node built-ins', async () => {
    const { createHash } = await import('node:crypto');
    return { createHash };
  })
  .measure('sha256 hash', ({ createHash }, buffer) => {
    createHash('sha256').update(buffer).digest('hex');
  });

// Relative imports resolve relative to benchmark file
const localFilesTarget = importExamples.target('local files', async () => {
  const { DEFAULT_CYCLES, Control } = await import('../build/types.js');

  return {
    DEFAULT_CYCLES,
    Control,
    // You can also define functions here
    processData: (data: Buffer) => data.length,
  };
});

localFilesTarget.measure('use imported constant', ({ DEFAULT_CYCLES }) => {
  DEFAULT_CYCLES > 100;
});

localFilesTarget.measure('use local function', ({ processData }, buffer) => {
  processData(buffer);
});

// Memory management pattern - prevent GC during measurements
importExamples
  .target('memory management', () => {
    const gcBlock = new Set();
    return { gcBlock };
  })
  .measure('without GC', ({ gcBlock }, buffer) => {
    const result = Buffer.concat([buffer, buffer]);
    gcBlock.add(result); // Keep reference alive
    result.length;
  });
