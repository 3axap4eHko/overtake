export * from './benchmark.js';
import { Benchmark as _Benchmark } from './benchmark.js';

declare global {
  const benchmark: (typeof _Benchmark)['create'];
}
