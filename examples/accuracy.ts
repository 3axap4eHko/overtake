import 'overtake';

const baseline = benchmark('accuracy tuning feed', () => {
  const bytes = 131_072;
  const uints = new Uint32Array(bytes / 4);
  for (let i = 0; i < uints.length; i++) {
    uints[i] = (i * 31) ^ 0x9e3779b1;
  }
  const src = Buffer.alloc(bytes, 7);
  const dst = Buffer.allocUnsafe(bytes);

  return { uints, src, dst };
});

baseline
  .target('deterministic math', () => {
    return { scratch: 0 };
  })
  .measure('sum uint32 array', (ctx, { uints }) => {
    let acc = ctx.scratch;
    for (let round = 0; round < 8; round++) {
      for (let i = 0; i < uints.length; i++) {
        acc += uints[i];
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

baseline.target('steady loop baseline').measure('counter increment', () => {
  let x = 0;
  for (let i = 0; i < 200_000; i++) {
    x += (i & 1023) >>> 0;
  }
  return x;
});
