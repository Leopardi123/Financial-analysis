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

function normalizeLegacyHistoricalChartRows(rows: unknown): FmpHistoricalRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => (typeof row === 'object' && row !== null ? normalizeHistoricalRow(row as Record<string, unknown>) : null))
    .filter((row): row is FmpHistoricalRow => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}


function subtractUtcDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function resolveLegacyCloseOnOrBefore(
  symbol: string,
  targetDateUtc: string,
  deps: {
    fetchApiV3JsonFn?: typeof fetchApiV3Json;
  } = {},
): Promise<{ close: number | null; warnings: string[] }> {
  const fetchApiV3JsonFn = deps.fetchApiV3JsonFn ?? fetchApiV3Json;
  const warnings: string[] = [];
  const todayUtc = todayUtcDateString();
  const clampedTo = targetDateUtc > todayUtc ? todayUtc : targetDateUtc;
  if (targetDateUtc > todayUtc) {
    warnings.push(`targetDate ${targetDateUtc} is in the future; clamped to ${todayUtc}`);
  }

  const from = subtractUtcDays(clampedTo, 14);
  const path = `historical-chart/1day/${encodeURIComponent(symbol)}`;
  const response = await fetchApiV3JsonFn<unknown>(path, { from, to: clampedTo });
  const rows = normalizeLegacyHistoricalChartRows(response);
  const eligible = rows.filter((row) => row.date <= clampedTo);
  const latest = eligible[eligible.length - 1];
  if (!latest) {
    warnings.push(`No close on or before ${clampedTo} for ${symbol}`);
    warnings.push(`legacyFetch: GET /api/v3/${path}?from=${from}&to=${clampedTo}`);
    return { close: null, warnings };
  }

  return { close: latest.close, warnings };
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
  } = {},
): Promise<LegacyCommodityQuoteRow[]> {
  const fetchApiV3JsonFn = deps.fetchApiV3JsonFn ?? fetchApiV3Json;
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
    const response = await fetchApiV3Json<unknown>(`historical-chart/1day/${encodeURIComponent(symbol)}`, { from: fromUtc, to: toUtc });
    const rows = normalizeLegacyHistoricalChartRows(response);
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
