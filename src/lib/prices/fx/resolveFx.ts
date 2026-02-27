import { fetchApiV3Json } from '../../../../api/_fmp.js';
import { getLegacySymbolForPriceKey } from '../providers/legacyCommoditySymbolMap.ts';
import { fxLookupCandidatesUSDTo } from './keys.ts';

export type FxScenario =
  | { mode: 'spot' }
  | { mode: 'percentile'; lookbackYears: number; percentile: number }
  | { mode: 'fixed'; fixedFx?: number };

type LegacyHistoricalResponse = Array<Record<string, unknown>>;

type FxHistoryRow = { date: string; close: number };

function subtractUtcYears(dateStr: string, years: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function subtractUtcDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveSpot(rows: FxHistoryRow[], anchorDateUtc: string): number | null {
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
  rows: FxHistoryRow[];
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

function invertFx(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return null;
  }
  return 1 / value;
}

function normalizeLegacyRows(response: LegacyHistoricalResponse): FxHistoryRow[] {
  return response
    .map((row) => {
      const date = typeof row.date === 'string' ? row.date.slice(0, 10) : null;
      const close = typeof row.close === 'number' && Number.isFinite(row.close) ? row.close : null;
      if (!date || close === null) {
        return null;
      }
      return { date, close };
    })
    .filter((row): row is FxHistoryRow => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function resolveFxUSDToTarget(
  args: {
    targetCurrency: string;
    anchorDateUtc: string;
    scenario: FxScenario;
    allowRefresh: boolean;
  },
  deps: {
    fetchHistorical?: (params: { symbol: string; from: string; to: string; path: string }) => Promise<LegacyHistoricalResponse>;
  } = {},
): Promise<{ fx: number | null; warnings: string[] }> {
  void args.allowRefresh;
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

  const warnings: string[] = [];
  const seenWarnings = new Set<string>();
  const pushWarning = (message: string) => {
    if (!seenWarnings.has(message)) {
      seenWarnings.add(message);
      warnings.push(message);
    }
  };

  const todayUtc = todayUtcDateString();
  const clampedAnchorDateUtc = args.anchorDateUtc > todayUtc ? todayUtc : args.anchorDateUtc;
  if (args.anchorDateUtc > todayUtc) {
    pushWarning(`targetDate ${args.anchorDateUtc} is in the future; clamped to ${todayUtc}`);
  }

  const fromUtc = args.scenario.mode === 'percentile'
    ? subtractUtcYears(clampedAnchorDateUtc, args.scenario.lookbackYears)
    : subtractUtcDays(clampedAnchorDateUtc, 14);

  const candidates = fxLookupCandidatesUSDTo(normalizedCurrency);

  for (const candidate of candidates) {
    const symbol = getLegacySymbolForPriceKey(candidate.priceKey);
    if (!symbol) {
      pushWarning(`Unknown legacy priceKey mapping: ${candidate.priceKey}`);
      continue;
    }

    const path = `historical-chart/1day/${encodeURIComponent(symbol)}`;
    const fetchHistorical = deps.fetchHistorical ?? ((params: { symbol: string; from: string; to: string; path: string }) =>
      fetchApiV3Json<LegacyHistoricalResponse>(params.path, { from: params.from, to: params.to }));

    const response = await fetchHistorical({ symbol, from: fromUtc, to: clampedAnchorDateUtc, path });
    const rows = normalizeLegacyRows(response);
    if (rows.length === 0) {
      pushWarning(`No price data returned from FMP legacy v3 for symbol ${symbol}`);
      pushWarning(`legacyFetch: GET /api/v3/${path}?from=${fromUtc}&to=${clampedAnchorDateUtc}`);
      continue;
    }

    const rawFx = args.scenario.mode === 'spot'
      ? resolveSpot(rows, clampedAnchorDateUtc)
      : resolvePercentile({
          rows,
          anchorDateUtc: clampedAnchorDateUtc,
          lookbackYears: args.scenario.lookbackYears,
          percentile: args.scenario.percentile,
        });
    const resolvedFx = candidate.invert ? invertFx(rawFx) : rawFx;

    if (resolvedFx !== null) {
      return { fx: resolvedFx, warnings };
    }

    const modeReason = args.scenario.mode === 'percentile'
      ? `No closes in trailing ${args.scenario.lookbackYears}y window for ${candidate.priceKey} <= ${clampedAnchorDateUtc}`
      : `No close on or before ${clampedAnchorDateUtc} for ${candidate.priceKey}`;

    pushWarning(modeReason);
  }

  return { fx: null, warnings };
}
