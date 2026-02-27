import { fetchApiV3Json, fetchStableJson } from '../../../../api/_fmp.js';
import { getLegacySymbolForPriceKey } from './legacyCommoditySymbolMap.ts';

export interface FmpQuoteResult {
  price: number;
  asof?: string;
}

export interface FmpHistoricalRow {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface ProviderPriceRow {
  dateUtc: string;
  close: number;
}

export interface LegacyCommodityQuoteRow {
  symbol: string;
  price: number;
  name?: string;
}

type FmpQuoteRow = {
  price?: number;
  timestamp?: number;
  date?: string;
};

type FmpHistoricalResponse = {
  historical?: Array<Record<string, unknown>>;
} | Array<Record<string, unknown>>;

type FmpHistoricalFullResponse = {
  symbol?: string;
  historical?: Array<Record<string, unknown>>;
};

let legacyCommodityQuotesCache: Promise<LegacyCommodityQuoteRow[]> | null = null;

export function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function addUtcDays(dateStr: string, days: number): string {
  const d = parseUtcDate(dateStr);
  const next = new Date(d.getTime() + (days * 24 * 60 * 60 * 1000));
  return formatDateUtc(next);
}

function todayUtcDateString(): string {
  return formatDateUtc(new Date());
}

export function buildHistoricalWindowUtc(args: {
  toUtc: string;
  lookbackDays?: number;
  maxLookbackDays?: number;
}): { fromUtc: string; toUtc: string; wasClamped: boolean; maxLookbackDays: number } {
  const toUtc = formatDateUtc(parseUtcDate(args.toUtc));
  const lookbackDays = Number.isFinite(args.lookbackDays) ? Math.max(1, Math.floor(args.lookbackDays as number)) : 30;
  const maxLookbackDays = Number.isFinite(args.maxLookbackDays) ? Math.max(1, Math.floor(args.maxLookbackDays as number)) : 60;

  const fromCandidate = addUtcDays(toUtc, -lookbackDays);
  const earliestAllowed = addUtcDays(toUtc, -maxLookbackDays);
  if (fromCandidate < earliestAllowed) {
    return { fromUtc: earliestAllowed, toUtc, wasClamped: true, maxLookbackDays };
  }

  return { fromUtc: fromCandidate, toUtc, wasClamped: false, maxLookbackDays };
}

function toIsoUtc(value: number | string | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return undefined;
}

function normalizeHistoricalRow(row: Record<string, unknown>): FmpHistoricalRow | null {
  const date = typeof row.date === 'string' ? row.date.slice(0, 10) : null;
  const close = typeof row.close === 'number' ? row.close : null;
  if (!date || close === null || !Number.isFinite(close)) {
    return null;
  }

  const asOptionalNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return undefined;
  };

  return {
    date,
    close,
    open: asOptionalNumber(row.open),
    high: asOptionalNumber(row.high),
    low: asOptionalNumber(row.low),
    volume: asOptionalNumber(row.volume),
  };
}

function normalizeHistoricalFullRows(response: unknown): FmpHistoricalRow[] {
  if (typeof response !== 'object' || response === null) {
    return [];
  }

  const historicalRaw = (response as FmpHistoricalFullResponse).historical;
  const historical = Array.isArray(historicalRaw) ? historicalRaw : [];

  return historical
    .map((row) => normalizeHistoricalRow(row))
    .filter((row): row is FmpHistoricalRow => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchLegacyCommodityHistoricalFull(
  symbol: string,
  args: { fromUtc: string; toUtc: string },
  deps: {
    fetchApiV3JsonFn?: typeof fetchApiV3Json;
  } = {},
): Promise<FmpHistoricalRow[]> {
  const fetchApiV3JsonFn = deps.fetchApiV3JsonFn ?? fetchApiV3Json;
  const path = `historical-price-full/${encodeURIComponent(symbol)}`;
  const response = await fetchApiV3JsonFn<unknown>(path, { from: args.fromUtc, to: args.toUtc });
  return normalizeHistoricalFullRows(response);
}

export async function resolveLegacyCommodityCloseOnOrBefore(
  symbol: string,
  targetDateUtc: string,
  deps: {
    fetchApiV3JsonFn?: typeof fetchApiV3Json;
  } = {},
): Promise<{ close: number | null; dateUtc: string | null; warnings: string[] }> {
  const warnings: string[] = [];
  const todayUtc = todayUtcDateString();
  const clampedTo = targetDateUtc > todayUtc ? todayUtc : targetDateUtc;
  if (targetDateUtc > todayUtc) {
    warnings.push(`targetDate ${targetDateUtc} is in the future; clamped to ${todayUtc}`);
  }

  const window = buildHistoricalWindowUtc({ toUtc: clampedTo, lookbackDays: 30, maxLookbackDays: 60 });
  if (window.wasClamped) {
    warnings.push(`historicalWindow: from clamped to ${window.fromUtc} (maxLookbackDays=${window.maxLookbackDays})`);
  }

  const rows = await fetchLegacyCommodityHistoricalFull(symbol, { fromUtc: window.fromUtc, toUtc: window.toUtc }, deps);
  const eligible = rows.filter((row) => row.date <= window.toUtc);
  const latest = eligible[eligible.length - 1];
  if (!latest) {
    warnings.push(`legacyFetch: GET /api/v3/historical-price-full/${symbol}?from=${window.fromUtc}&to=${window.toUtc}`);
    return { close: null, dateUtc: null, warnings };
  }

  warnings.push(`commodity history resolved via historical-price-full: ${symbol} close=${latest.close} date=${latest.date}`);
  return { close: latest.close, dateUtc: latest.date, warnings };
}

export async function resolveLegacyCloseOnOrBefore(
  symbol: string,
  targetDateUtc: string,
  deps: {
    fetchApiV3JsonFn?: typeof fetchApiV3Json;
  } = {},
): Promise<{ close: number | null; warnings: string[] }> {
  const resolved = await resolveLegacyCommodityCloseOnOrBefore(symbol, targetDateUtc, deps);
  if (resolved.close === null) {
    const window = buildHistoricalWindowUtc({ toUtc: targetDateUtc > todayUtcDateString() ? todayUtcDateString() : targetDateUtc, lookbackDays: 30, maxLookbackDays: 60 });
    const warnings = [...resolved.warnings, `No close on or before ${window.toUtc} for ${symbol}`];
    return { close: null, warnings };
  }
  return { close: resolved.close, warnings: resolved.warnings };
}

export async function fetchQuote(symbol: string): Promise<FmpQuoteResult> {
  const rows = await fetchStableJson<FmpQuoteRow[]>('quote', { symbol });
  const quote = rows?.[0];
  if (!quote || typeof quote.price !== 'number' || !Number.isFinite(quote.price)) {
    throw new Error(`FMP quote missing valid price for symbol: ${symbol}`);
  }

  return {
    price: quote.price,
    asof: toIsoUtc(quote.timestamp ?? quote.date),
  };
}

export async function fetchLegacyCommodityQuotes(
  deps: {
    fetchApiV3JsonFn?: typeof fetchApiV3Json;
    disableCache?: boolean;
  } = {},
): Promise<LegacyCommodityQuoteRow[]> {
  const fetchApiV3JsonFn = deps.fetchApiV3JsonFn ?? fetchApiV3Json;
  if (!deps.disableCache && deps.fetchApiV3JsonFn === undefined) {
    if (!legacyCommodityQuotesCache) {
      legacyCommodityQuotesCache = fetchApiV3JsonFn<Array<Record<string, unknown>>>('quotes/commodity').then((rows) =>
        rows
          .map((row) => {
            const symbol = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : null;
            const price = typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : null;
            if (!symbol || price === null) {
              return null;
            }
            return {
              symbol,
              price,
              ...(typeof row.name === 'string' ? { name: row.name } : {}),
            };
          })
          .filter((row): row is LegacyCommodityQuoteRow => row !== null),
      );
    }
    return legacyCommodityQuotesCache;
  }

  const rows = await fetchApiV3JsonFn<Array<Record<string, unknown>>>('quotes/commodity');
  return rows
    .map((row) => {
      const symbol = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : null;
      const price = typeof row.price === 'number' && Number.isFinite(row.price) ? row.price : null;
      if (!symbol || price === null) {
        return null;
      }
      return {
        symbol,
        price,
        ...(typeof row.name === 'string' ? { name: row.name } : {}),
      };
    })
    .filter((row): row is LegacyCommodityQuoteRow => row !== null);
}

export async function getLegacyQuote(
  symbol: string,
  deps: {
    fetchLegacyCommodityQuotesFn?: typeof fetchLegacyCommodityQuotes;
  } = {},
): Promise<LegacyCommodityQuoteRow | null> {
  const fetchLegacyCommodityQuotesFn = deps.fetchLegacyCommodityQuotesFn ?? fetchLegacyCommodityQuotes;
  const normalized = symbol.trim().toUpperCase();
  const quotes = await fetchLegacyCommodityQuotesFn();
  return quotes.find((quote) => quote.symbol === normalized) ?? null;
}

export async function fetchHistoricalEodFull(symbol: string): Promise<FmpHistoricalRow[]> {
  const response = await fetchStableJson<FmpHistoricalResponse>('historical-price-eod/full', { symbol });
  const rows = Array.isArray(response) ? response : Array.isArray(response?.historical) ? response.historical : [];

  return rows
    .map((row) => normalizeHistoricalRow(row))
    .filter((row): row is FmpHistoricalRow => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchLatest(provider_symbol: string, _provider_kind: string): Promise<ProviderPriceRow> {
  const quote = await fetchQuote(provider_symbol);
  return {
    dateUtc: (quote.asof ?? new Date().toISOString()).slice(0, 10),
    close: quote.price,
  };
}

export async function fetchHistorical(
  provider_symbol: string,
  _provider_kind: string,
  fromUtc: string,
  toUtc: string,
  priceKey?: string,
): Promise<ProviderPriceRow[]> {
  const legacySymbol = priceKey ? getLegacySymbolForPriceKey(priceKey) : null;
  if (priceKey && !legacySymbol) {
    return [];
  }

  const symbol = legacySymbol ?? provider_symbol;
  if (legacySymbol) {
    const rows = await fetchLegacyCommodityHistoricalFull(symbol, {
      fromUtc: formatDateUtc(parseUtcDate(fromUtc)),
      toUtc: formatDateUtc(parseUtcDate(toUtc)),
    });
    return rows
      .filter((row) => row.date >= fromUtc && row.date <= toUtc)
      .map((row) => ({ dateUtc: row.date, close: row.close }));
  }

  const response = await fetchStableJson<FmpHistoricalResponse>('historical-price-eod/full', { symbol });
  const sourceRows = Array.isArray(response) ? response : Array.isArray(response?.historical) ? response.historical : [];
  const rows = sourceRows
    .map((row) => normalizeHistoricalRow(row))
    .filter((row): row is FmpHistoricalRow => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return rows
    .filter((row) => row.date >= fromUtc && row.date <= toUtc)
    .map((row) => ({ dateUtc: row.date, close: row.close }));
}
