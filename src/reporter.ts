import { div, max, divs } from './utils.js';
import { ReportType, DURATION_SCALE } from './types.js';

const units = [
  { unit: 'ns', factor: 1 },
  { unit: 'µs', factor: 1e3 },
  { unit: 'ms', factor: 1e6 },
  { unit: 's', factor: 1e9 },
  { unit: 'm', factor: 60 * 1e9 },
  { unit: 'h', factor: 3600 * 1e9 },
] as const;

function smartFixed(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  });
}
export class Report {
  constructor(
    public readonly type: ReportType,
    public readonly value: bigint,
    public readonly uncertainty: number = 0,
    public readonly scale: bigint = 1n,
  ) {}
  valueOf() {
    return Number(div(this.value, this.scale));
  }
  toString() {
    const uncertainty = this.uncertainty ? ` ± ${smartFixed(this.uncertainty)}%` : '';

    const value = this.valueOf();
    if (this.type === 'ops') {
      return `${smartFixed(value)} ops/s${uncertainty}`;
    }
    let display = value;
    let unit = 'ns';

    for (const { unit: u, factor } of units) {
      const candidate = value / factor;
      if (candidate < 1000) {
        display = candidate;
        unit = u;
        break;
      }
    }
    return `${smartFixed(display)} ${unit}${uncertainty}`;
  }
}

export const createReport = (durations: BigUint64Array, type: ReportType): Report => {
  const n = durations.length;
  if (n === 0) {
    return new Report(type, 0n);
  }
  switch (type) {
    case 'min': {
      return new Report(type, durations[0], 0, DURATION_SCALE);
    }
    case 'max': {
      return new Report(type, durations[n - 1], 0, DURATION_SCALE);
    }
    case 'median': {
      const mid = Math.floor(n / 2);
      const med = n % 2 === 0 ? (durations[mid - 1] + durations[mid]) / 2n : durations[mid];
      return new Report(type, med, 0, DURATION_SCALE);
    }

    case 'mode': {
      const freq = new Map<bigint, bigint>();
      let maxCount = 0n;
      let modeVal = durations[0];
      for (const d of durations) {
        const count = (freq.get(d) || 0n) + 1n;
        freq.set(d, count);
        if (count > maxCount) {
          maxCount = count;
          modeVal = d;
        }
      }
      let lower = modeVal;
      let upper = modeVal;
      const firstIdx = durations.indexOf(modeVal);
      const lastIdx = durations.lastIndexOf(modeVal);
      if (firstIdx > 0) lower = durations[firstIdx - 1];
      if (lastIdx < n - 1) upper = durations[lastIdx + 1];
      const gap = max(modeVal - lower, upper - modeVal);
      const uncertainty = modeVal > 0 ? Number(((gap / 2n) * 100n) / modeVal) : 0;
      return new Report(type, modeVal, uncertainty, DURATION_SCALE);
    }

    case 'ops': {
      let sum = 0n;
      for (const duration of durations) {
        sum += duration;
      }
      const avgScaled = sum / BigInt(n);
      const nsPerSecScaled = 1_000_000_000n * DURATION_SCALE;
      const raw = Number(nsPerSecScaled) / Number(avgScaled);
      const extra = raw < 1 ? Math.ceil(-Math.log10(raw)) : 0;

      const exp = raw > 100 ? 0 : 2 + extra;

      const scale = 10n ** BigInt(exp);

      const value = avgScaled > 0n ? (nsPerSecScaled * scale) / avgScaled : 0n;
      const deviation = durations[n - 1] - durations[0];
      const uncertainty = avgScaled > 0 ? Number(div(deviation * scale, 2n * avgScaled)) : 0;
      return new Report(type, value, uncertainty, scale);
    }
    case 'mean': {
      let sum = 0n;
      for (const duration of durations) {
        sum += duration;
      }
      const value = divs(sum, BigInt(n), 1n);
      return new Report(type, value, 0, DURATION_SCALE);
    }

    default: {
      const p = Number(type.slice(1));
      if (p === 0) {
        return new Report(type, durations[0], 0, DURATION_SCALE);
      }
      if (p === 100) {
        return new Report(type, durations[n - 1], 0, DURATION_SCALE);
      }
      const idx = Math.ceil((p / 100) * n) - 1;
      const value = durations[Math.min(Math.max(idx, 0), n - 1)];
      const prev = idx > 0 ? durations[idx - 1] : value;
      const next = idx < n - 1 ? durations[idx + 1] : value;
      const gap = max(value - prev, next - value);
      const uncertainty = value > 0 ? Number(div(divs(gap, 2n, 100_00n), value)) / 100 : 0;

      return new Report(type, value, uncertainty, DURATION_SCALE);
    }
  }
};
