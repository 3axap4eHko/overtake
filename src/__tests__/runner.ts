import { Benchmark } from '../benchmark.js';

const benchmark = Benchmark.create('void')
  .feed('strings', () => ['a', 'b', 'c'])
  .feed('numbers', () => [0, 1, 2]);

const httpServer = benchmark.target('node http', async () => {
  const { createServer, Server } = await import('node:http');
  const server = createServer();
  return new Promise<InstanceType<typeof Server>>((resolve) => {
    server.on('listen', () => resolve(server));
  });
});

httpServer.teardown((ctx) => {
  ctx.close();
});

httpServer
  .measure('something to bench', async (ctx, input) => {
    ctx.emit('whatever', input);
  })
  .pre(async (ctx, input) => {})
  .post(async (ctx, input) => {});

const forLoop = benchmark.target('for loop');

forLoop
  .measure('1k', (_, input) => {
    const n = input?.length ?? 0;
    for (let i = 0; i < n; i++) {}
  })
  .pre(async (ctx, input) => {})
  .post(async (ctx, input) => {});
