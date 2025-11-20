import { transform } from '@swc/core';

export const abs = (value: bigint) => {
  if (value < 0n) {
    return -value;
  }
  return value;
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

export const divMod = (a: bigint, b: bigint) => {
  return { quotient: a / b, remainder: a % b };
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

export class ScaledBigInt {
  constructor(
    public value: bigint,
    public scale: bigint,
  ) {}
  add(value: bigint) {
    this.value += value * this.scale;
  }
  sub(value: bigint) {
    this.value -= value * this.scale;
  }
  div(value: bigint) {
    this.value /= value;
  }
  mul(value: bigint) {
    this.value *= value;
  }
  unscale() {
    return this.value / this.scale;
  }
  number() {
    return Number(div(this.value, this.scale));
  }
}

export const transpile = async (code: string): Promise<string> => {
  const output = await transform(code, {
    filename: 'benchmark.ts',
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: false,
        dynamicImport: true,
      },
      target: 'esnext',
    },
    module: {
      type: 'es6',
    },
  });
  return output.code;
};
