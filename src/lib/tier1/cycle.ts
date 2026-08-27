import { TIER1_POLICY } from './config.ts';

export type PriceHistoryRow = { date: string; close: number };

export type Tier1CycleMultiplierResult = {
  status: 'COMPUTABLE' | 'NOT_VERIFIED';
  multiplier: number | null;
  monthlyObservations: number;
  ratioObservations: number;
  method: string;
  reason: string | null;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0 || !Number.isFinite(q) || q < 0 || q > 1) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Normalizes mixed daily/monthly provider history to one month-end observation.
 * For daily FMP series the last available close in the month is used. FRED monthly
 * observations already arrive at month end and pass through unchanged.
 */
export function toMonthlyLast(rows: PriceHistoryRow[]): PriceHistoryRow[] {
  const byMonth = new Map<string, PriceHistoryRow>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !finite(row.close) || row.close <= 0) continue;
    const month = row.date.slice(0, 7);
    const previous = byMonth.get(month);
    if (!previous || row.date > previous.date) byMonth.set(month, row);
  }
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Bear severity is measured RELATIVE to the price regime of its own time, not as an
 * absolute historic price. For each month we divide price by the trailing 60-month
 * median, then use the 20th percentile of those ratios. This avoids the invalid test
 * of applying, for example, a 2002 nominal gold price to a 2026 cost structure.
 */
export function computeTier1CycleMultiplier(rows: PriceHistoryRow[]): Tier1CycleMultiplierResult {
  const monthly = toMonthlyLast(rows);
  const trendMonths = TIER1_POLICY.cycleTrendMonths;
  const method = `P${Math.round(TIER1_POLICY.cyclePercentile * 100)} of monthly price / trailing ${trendMonths}m median; ${TIER1_POLICY.cycleLookbackYears}y lookback; applied for ${TIER1_POLICY.cycleDurationProductionPeriods} production periods`;

  if (monthly.length < TIER1_POLICY.minimumHistoryMonths) {
    return {
      status: 'NOT_VERIFIED',
      multiplier: null,
      monthlyObservations: monthly.length,
      ratioObservations: 0,
      method,
      reason: `Need at least ${TIER1_POLICY.minimumHistoryMonths} monthly observations; found ${monthly.length}.`,
    };
  }

  const ratios: number[] = [];
  for (let index = trendMonths - 1; index < monthly.length; index += 1) {
    const window = monthly.slice(index - trendMonths + 1, index + 1).map((row) => row.close);
    const localMedian = median(window);
    if (localMedian === null || localMedian <= 0) continue;
    const ratio = monthly[index].close / localMedian;
    if (finite(ratio) && ratio > 0) ratios.push(ratio);
  }

  const multiplier = quantile(ratios, TIER1_POLICY.cyclePercentile);
  if (multiplier === null || multiplier <= 0 || multiplier >= 1) {
    return {
      status: 'NOT_VERIFIED',
      multiplier: null,
      monthlyObservations: monthly.length,
      ratioObservations: ratios.length,
      method,
      reason: `Relative bear multiplier must resolve within (0,1); got ${String(multiplier)}.`,
    };
  }

  return {
    status: 'COMPUTABLE',
    multiplier,
    monthlyObservations: monthly.length,
    ratioObservations: ratios.length,
    method,
    reason: null,
  };
}
