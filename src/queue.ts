export const createQueue = <T>(worker: (task: T) => Promise<void>, concurency: number = 1) => {
  const queue = new Set<T>();
  const processing = new Map<number, Promise<void>>();
  const iterator = queue[Symbol.iterator]();

  let next: () => void;
  let counter = 0;

  queueMicrotask(async () => {
    while (true) {
      if (concurency > 0 && processing.size === concurency) {
        await Promise.race(processing.values());
      }
      if (queue.size === 0) {
        const { promise, resolve } = Promise.withResolvers<void>();
        next = resolve;
        await promise;
      }
      const result = iterator.next();
      if (result.done) {
        break;
      }
      const id = counter++;
      const task = Promise.resolve(worker(result.value))
        .catch(() => {})
        .finally(() => {
          processing.delete(id);
        });
      processing.set(id, task);
    }
  });

  return {
    push: async (input: T) => {
      queue.add(input);

      if (queue.size === 0) {
        next?.();
      }
    },
  };
};
