import { readHistoryRowsInRange, type HistoryRow } from '../db/readHistory.ts';
import { refreshHistoryRangeToMonthlyBlobs } from '../refreshHistory.ts';
import { fxKeyUSDTo } from './keys.ts';

export type FxScenario =
  | { mode: 'spot' }
  | { mode: 'percentile'; lookbackYears: number; percentile: number }
  | { mode: 'fixed'; fixedFx?: number };

function subtractUtcYears(dateStr: string, years: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function resolveSpot(rows: HistoryRow[], anchorDateUtc: string): number | null {
  const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  let latest: number | null = null;
  for (const row of sortedRows) {
    if (row.date > anchorDateUtc) {
      break;
    }
    latest = row.close;
  }
  return latest;
}

function resolvePercentile(args: {
  rows: HistoryRow[];
  anchorDateUtc: string;
  lookbackYears: number;
  percentile: number;
}): number | null {
  const windowStart = subtractUtcYears(args.anchorDateUtc, args.lookbackYears);
  const closes = args.rows
    .filter((row) => row.date >= windowStart && row.date <= args.anchorDateUtc)
    .map((row) => row.close)
    .sort((a, b) => a - b);

  if (closes.length === 0) {
    return null;
  }

  const index = Math.floor((args.percentile / 100) * (closes.length - 1));
  return closes[index];
}

export async function resolveFxUSDToTarget(
  args: {
    targetCurrency: string;
    anchorDateUtc: string;
    scenario: FxScenario;
    allowRefresh: boolean;
  },
  deps: {
    readHistoryRows?: typeof readHistoryRowsInRange;
    refreshHistory?: typeof refreshHistoryRangeToMonthlyBlobs;
  } = {},
): Promise<{ fx: number | null; warnings: string[] }> {
  const normalizedCurrency = args.targetCurrency.toUpperCase();
  if (normalizedCurrency === 'USD') {
    return { fx: 1, warnings: [] };
  }

  if (args.scenario.mode === 'fixed') {
    if (Number.isFinite(args.scenario.fixedFx) && (args.scenario.fixedFx as number) > 0) {
      return { fx: args.scenario.fixedFx as number, warnings: [] };
    }
    return { fx: null, warnings: ['FX fixed scenario missing fixedFx > 0'] };
  }

  const key = fxKeyUSDTo(normalizedCurrency);
  const readHistoryRows = deps.readHistoryRows ?? ((params) => readHistoryRowsInRange(params));
  const refreshHistory = deps.refreshHistory ?? ((params) => refreshHistoryRangeToMonthlyBlobs(params));
  const from = args.scenario.mode === 'percentile'
    ? subtractUtcYears(args.anchorDateUtc, args.scenario.lookbackYears)
    : args.anchorDateUtc;

  let history = await readHistoryRows({
    priceKey: key,
    from,
    to: args.anchorDateUtc,
  });

  if (history.missing && args.allowRefresh) {
    await refreshHistory({
      priceKey: key,
      from,
      to: args.anchorDateUtc,
    });
    history = await readHistoryRows({
      priceKey: key,
      from,
      to: args.anchorDateUtc,
    });
  }

  let fx: number | null;
  if (args.scenario.mode === 'spot') {
    fx = resolveSpot(history.rows, args.anchorDateUtc);
  } else {
    fx = resolvePercentile({
      rows: history.rows,
      anchorDateUtc: args.anchorDateUtc,
      lookbackYears: args.scenario.lookbackYears,
      percentile: args.scenario.percentile,
    });
  }

  if (fx !== null) {
    return { fx, warnings: [] };
  }

  const modeReason = args.scenario.mode === 'percentile'
    ? `No closes in trailing ${args.scenario.lookbackYears}y window for ${key} <= ${args.anchorDateUtc}`
    : `No close on or before ${args.anchorDateUtc} for ${key}`;

  if (!args.allowRefresh) {
    return { fx: null, warnings: [`${modeReason}; refresh=0 so auto-resolve cannot backfill`] };
  }

  return { fx: null, warnings: [modeReason] };
}
