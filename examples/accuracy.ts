import 'overtake';

const baseline = benchmark('accuracy tuning feed', () => {
  const bytes = 131_072;
  const uints = new Uint32Array(bytes / 4);
  for (let i = 0; i < uints.length; i++) {
    uints[i] = (i * 31) ^ 0x9e3779b1;
  }
  const tiny = Buffer.alloc(4_096, 3);
  const src = Buffer.alloc(bytes, 7);
  const dst = Buffer.allocUnsafe(bytes);

  return { uints, tiny, src, dst };
});

baseline
  .target('deterministic math', () => {
    return { scratch: 0 };
  })
  .measure('sum uint32 array', (ctx, { uints }) => {
    let acc = ctx.scratch | 0;
    for (let round = 0; round < 8; round++) {
      for (let i = 0; i < uints.length; i++) {
        acc = (acc + uints[i]) | 0;
      }
    }
    ctx.scratch = acc;
  });

baseline.target('buffer reuse copy').measure('copy preallocated buffer', (_, { src, dst }) => {
  for (let round = 0; round < 8; round++) {
    dst.set(src);
  }
});

baseline
  .target('buffer reuse xor')
  .measure('xor in place', (_, { src, dst }) => {
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < src.length; i++) {
        dst[i] ^= src[i];
      }
    }
  })
  .pre((_, { dst }) => {
    dst.fill(0);
  });

baseline.target('steady loop baseline').measure('counter increment', (_, { uints }) => {
  let x = 0;
  for (let i = 0; i < 200_000; i++) {
    x = (x + uints[i & (uints.length - 1)]) | 0;
  }
  return x;
});

const gcImpact = baseline.target('gc impact', () => {
  const pool: Buffer[] = Array.from({ length: 512 }, () => Buffer.alloc(4_096));
  return { pool };
});

gcImpact.measure('alloc churn', (_, { tiny }) => {
  let x = 0;
  for (let i = 0; i < 512; i++) {
    const buf = Buffer.from(tiny);
    x ^= buf[0];
  }
  return x;
});

gcImpact.measure('pool reuse', (ctx, { tiny }) => {
  let x = 0;
  const { pool } = ctx;
  for (let i = 0; i < pool.length; i++) {
    pool[i].set(tiny);
    x ^= pool[i][0];
  }
  return x;
});
