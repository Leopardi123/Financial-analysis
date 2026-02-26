import { fetchStableJson } from "../../../../api/_fmp.js";

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

type FmpQuoteRow = {
  price?: number;
  timestamp?: number;
  date?: string;
};

type FmpHistoricalResponse = {
  historical?: Array<Record<string, unknown>>;
} | Array<Record<string, unknown>>;

function toIsoUtc(value: number | string | undefined): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return undefined;
}

export async function fetchQuote(symbol: string): Promise<FmpQuoteResult> {
  const rows = await fetchStableJson<FmpQuoteRow[]>("quote", { symbol });
  const quote = rows?.[0];
  if (!quote || typeof quote.price !== "number" || !Number.isFinite(quote.price)) {
    throw new Error(`FMP quote missing valid price for symbol: ${symbol}`);
  }

  return {
    price: quote.price,
    asof: toIsoUtc(quote.timestamp ?? quote.date),
  };
}

function normalizeHistoricalRow(row: Record<string, unknown>): FmpHistoricalRow | null {
  const date = typeof row.date === "string" ? row.date.slice(0, 10) : null;
  const close = typeof row.close === "number" ? row.close : null;
  if (!date || close === null || !Number.isFinite(close)) {
    return null;
  }

  const asOptionalNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) {
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

export async function fetchHistoricalEodFull(symbol: string): Promise<FmpHistoricalRow[]> {
  const response = await fetchStableJson<FmpHistoricalResponse>("historical-price-eod/full", { symbol });
  const rows = Array.isArray(response) ? response : Array.isArray(response?.historical) ? response.historical : [];

  return rows
    .map((row) => normalizeHistoricalRow(row))
    .filter((row): row is FmpHistoricalRow => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
