import { toMonthlyLast, type PriceHistoryRow } from './cycle.ts';

export type RecentSustainedLowPoint = {
  date: string;
  rollingAverage: number;
};

export type RecentSustainedLowResult = {
  status: 'COMPUTABLE' | 'NOT_VERIFIED';
  lookbackYears: number;
  rollingMonths: number;
  minimumSeparationMonths: number;
  selectedLowCount: number;
  monthlyObservations: number;
  rollingObservations: number;
  lows: RecentSustainedLowPoint[];
  stressPrice: number | null;
  reason: string | null;
};

function mean(values: number[]): number {
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

export function analyzeRecentSustainedLows(
  rows: PriceHistoryRow[],
  args: {
    lookbackYears: number;
    rollingMonths?: number;
    minimumSeparationMonths?: number;
    selectedLowCount?: number;
  },
): RecentSustainedLowResult {
  const rollingMonths = args.rollingMonths ?? 6;
  const minimumSeparationMonths = args.minimumSeparationMonths ?? 12;
  const selectedLowCount = args.selectedLowCount ?? 3;
  const monthly = toMonthlyLast(rows);

  const rolling: RecentSustainedLowPoint[] = [];
  for (let index = rollingMonths - 1; index < monthly.length; index += 1) {
    const window = monthly.slice(index - rollingMonths + 1, index + 1);
    if (window.length !== rollingMonths) continue;
    rolling.push({
      date: monthly[index].date,
      rollingAverage: mean(window.map((row) => row.close)),
    });
  }

  const candidates = [...rolling].sort((a, b) => a.rollingAverage - b.rollingAverage || a.date.localeCompare(b.date));
  const lows: RecentSustainedLowPoint[] = [];
  for (const candidate of candidates) {
    const separated = lows.every((existing) =>
      Math.abs(monthOrdinal(candidate.date) - monthOrdinal(existing.date)) >= minimumSeparationMonths,
    );
    if (!separated) continue;
    lows.push(candidate);
    if (lows.length === selectedLowCount) break;
  }
  lows.sort((a, b) => a.date.localeCompare(b.date));

  const stressPrice = median(lows.map((point) => point.rollingAverage));
  if (lows.length < selectedLowCount || stressPrice === null || !(stressPrice > 0)) {
    return {
      status: 'NOT_VERIFIED',
      lookbackYears: args.lookbackYears,
      rollingMonths,
      minimumSeparationMonths,
      selectedLowCount,
      monthlyObservations: monthly.length,
      rollingObservations: rolling.length,
      lows,
      stressPrice: null,
      reason: `Kunde bara identifiera ${lows.length} av ${selectedLowCount} separerade lågprispunkter.`,
    };
  }

  return {
    status: 'COMPUTABLE',
    lookbackYears: args.lookbackYears,
    rollingMonths,
    minimumSeparationMonths,
    selectedLowCount,
    monthlyObservations: monthly.length,
    rollingObservations: rolling.length,
    lows,
    stressPrice,
    reason: null,
  };
}
