import { TIER1_POLICY } from './config.ts';

export type PriceHistoryRow = { date: string; close: number };

export type Tier1CycleMultiplierResult = {
  status: 'COMPUTABLE' | 'NOT_VERIFIED';
  multiplier: number | null;
  monthlyObservations: number;
  ratioObservations: number;
  bearEpisodes: number;
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

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
 * Measures a sustained bear regime rather than mixing bull and bear months.
 * Each observation compares the trailing 12-month average price with the median
 * of the PRECEDING 60 months. Months at or below 95% of that prior regime are
 * grouped into contiguous bear episodes. Only episodes lasting at least six
 * months count; the stored stress multiplier is the median trough across those
 * episodes. This remains relative to each commodity's own historical regime and
 * therefore does not apply obsolete absolute prices to today's cost structure.
 */
export function computeTier1CycleMultiplier(rows: PriceHistoryRow[]): Tier1CycleMultiplierResult {
  const monthly = toMonthlyLast(rows);
  const trendMonths = TIER1_POLICY.cycleTrendMonths;
  const rollingMonths = TIER1_POLICY.cycleRollingMonths;
  const threshold = TIER1_POLICY.cycleBearThresholdRatio;
  const minEpisodeMonths = TIER1_POLICY.cycleMinimumEpisodeMonths;
  const method = `Sustained bear episodes: ${rollingMonths}m average / prior ${trendMonths}m median; episode <=${threshold.toFixed(2)} for >=${minEpisodeMonths}m; median episode trough; ${TIER1_POLICY.cycleLookbackYears}y lookback; applied for ${TIER1_POLICY.cycleDurationProductionPeriods} production years`;

  if (monthly.length < TIER1_POLICY.minimumHistoryMonths) {
    return {
      status: 'NOT_VERIFIED', multiplier: null, monthlyObservations: monthly.length,
      ratioObservations: 0, bearEpisodes: 0, method,
      reason: `Need at least ${TIER1_POLICY.minimumHistoryMonths} monthly observations; found ${monthly.length}.`,
    };
  }

  const ratios: Array<{ index: number; ratio: number }> = [];
  const firstIndex = trendMonths + rollingMonths - 1;
  for (let index = firstIndex; index < monthly.length; index += 1) {
    const current = monthly.slice(index - rollingMonths + 1, index + 1).map((row) => row.close);
    const prior = monthly.slice(index - rollingMonths - trendMonths + 1, index - rollingMonths + 1).map((row) => row.close);
    const currentAverage = mean(current);
    const priorMedian = median(prior);
    if (currentAverage === null || priorMedian === null || priorMedian <= 0) continue;
    const ratio = currentAverage / priorMedian;
    if (finite(ratio) && ratio > 0) ratios.push({ index, ratio });
  }

  const episodes: number[][] = [];
  let active: number[] = [];
  let previousIndex: number | null = null;
  for (const observation of ratios) {
    const qualifies = observation.ratio <= threshold;
    const contiguous = previousIndex !== null && observation.index === previousIndex + 1;
    if (qualifies) {
      if (!contiguous && active.length > 0) {
        episodes.push(active);
        active = [];
      }
      active.push(observation.ratio);
    } else if (active.length > 0) {
      episodes.push(active);
      active = [];
    }
    previousIndex = observation.index;
  }
  if (active.length > 0) episodes.push(active);

  const sustainedEpisodes = episodes.filter((episode) => episode.length >= minEpisodeMonths);
  const troughs = sustainedEpisodes.map((episode) => Math.min(...episode));
  const multiplier = quantile(troughs, TIER1_POLICY.cycleEpisodeTroughQuantile);

  if (multiplier === null || multiplier <= 0 || multiplier >= 1) {
    return {
      status: 'NOT_VERIFIED', multiplier: null, monthlyObservations: monthly.length,
      ratioObservations: ratios.length, bearEpisodes: sustainedEpisodes.length, method,
      reason: sustainedEpisodes.length === 0
        ? `No sustained bear episode met <=${threshold.toFixed(2)} for >=${minEpisodeMonths} months.`
        : `Relative bear multiplier must resolve within (0,1); got ${String(multiplier)}.`,
    };
  }

  return {
    status: 'COMPUTABLE', multiplier, monthlyObservations: monthly.length,
    ratioObservations: ratios.length, bearEpisodes: sustainedEpisodes.length, method, reason: null,
  };
}
