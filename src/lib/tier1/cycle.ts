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

const RECENT_LOW_LOOKBACK_YEARS = 7;
const RECENT_LOW_ROLLING_MONTHS = 6;
const RECENT_LOW_MIN_SEPARATION_MONTHS = 12;
const RECENT_LOW_COUNT = 3;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function monthOrdinal(date: string): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return year * 12 + month - 1;
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
 * Active Tier cycle policy (2026-09-02): Recent Sustained Low.
 * Uses the most recent seven years of monthly history, a six-month rolling
 * average, three lowest observations separated by at least twelve months, and
 * the median of those lows as the modern sustained low-price reference.
 */
export function computeTier1CycleMultiplier(rows: PriceHistoryRow[]): Tier1CycleMultiplierResult {
  const monthlyAll = toMonthlyLast(rows);
  const method = `Modernt uthålligt lågpris (ersätter Uthålliga lågcykelepisoder): senaste ${RECENT_LOW_LOOKBACK_YEARS} åren; ${RECENT_LOW_ROLLING_MONTHS} månaders rullande genomsnitt; tre lägsta punkter med minst ${RECENT_LOW_MIN_SEPARATION_MONTHS} månaders separation; medianen av de tre används som lågprisreferens; appliceras under 3 produktionsår`;

  if (monthlyAll.length === 0) {
    return { status: 'NOT_VERIFIED', multiplier: null, monthlyObservations: 0, ratioObservations: 0, bearEpisodes: 0, method, reason: 'Ingen användbar prishistorik hittades.' };
  }

  const latest = monthlyAll[monthlyAll.length - 1];
  const latestOrdinal = monthOrdinal(latest.date);
  const firstAllowedOrdinal = latestOrdinal - RECENT_LOW_LOOKBACK_YEARS * 12 + 1;
  const monthly = monthlyAll.filter((row) => monthOrdinal(row.date) >= firstAllowedOrdinal);

  if (monthly.length < RECENT_LOW_ROLLING_MONTHS + (RECENT_LOW_COUNT - 1) * RECENT_LOW_MIN_SEPARATION_MONTHS) {
    return {
      status: 'NOT_VERIFIED', multiplier: null, monthlyObservations: monthly.length,
      ratioObservations: 0, bearEpisodes: 0, method,
      reason: `För få månadsobservationer för ${RECENT_LOW_LOOKBACK_YEARS}-årsmetoden; ${monthly.length} hittades.`,
    };
  }

  const rolling: Array<{ date: string; average: number }> = [];
  for (let index = RECENT_LOW_ROLLING_MONTHS - 1; index < monthly.length; index += 1) {
    const average = mean(monthly.slice(index - RECENT_LOW_ROLLING_MONTHS + 1, index + 1).map((row) => row.close));
    if (average !== null && average > 0) rolling.push({ date: monthly[index].date, average });
  }

  const selected: Array<{ date: string; average: number }> = [];
  for (const candidate of [...rolling].sort((a, b) => a.average - b.average || a.date.localeCompare(b.date))) {
    if (!selected.every((existing) => Math.abs(monthOrdinal(candidate.date) - monthOrdinal(existing.date)) >= RECENT_LOW_MIN_SEPARATION_MONTHS)) continue;
    selected.push(candidate);
    if (selected.length === RECENT_LOW_COUNT) break;
  }

  const stressPrice = median(selected.map((point) => point.average));
  if (selected.length < RECENT_LOW_COUNT || stressPrice === null || !(stressPrice > 0) || !(latest.close > 0)) {
    return {
      status: 'NOT_VERIFIED', multiplier: null, monthlyObservations: monthly.length,
      ratioObservations: rolling.length, bearEpisodes: selected.length, method,
      reason: `Kunde bara identifiera ${selected.length} av ${RECENT_LOW_COUNT} separerade moderna lågprispunkter.`,
    };
  }

  const multiplier = Math.min(stressPrice / latest.close, 0.999999);
  if (!finite(multiplier) || multiplier <= 0 || multiplier >= 1) {
    return {
      status: 'NOT_VERIFIED', multiplier: null, monthlyObservations: monthly.length,
      ratioObservations: rolling.length, bearEpisodes: selected.length, method,
      reason: `Lågprismultiplikatorn kunde inte beräknas giltigt från referenspris ${stressPrice} och senaste månadspris ${latest.close}.`,
    };
  }

  return {
    status: 'COMPUTABLE', multiplier, monthlyObservations: monthly.length,
    ratioObservations: rolling.length, bearEpisodes: selected.length, method, reason: null,
  };
}
