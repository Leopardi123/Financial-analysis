import { mergeMonthlyPayload, encodeMonthlyPayload, decodeMonthlyPayload, type MonthlyPricePayload } from "./historyBlob.js";
import { fetchHistoricalEodFull } from "./providers/fmp.js";
import type { PriceKey } from "./keys.js";

const PRICE_PROVIDER_MAP_TABLE = "price_provider_map";
const PRICE_EOD_MONTHLY_TABLE = "price_eod_monthly";

type ProviderMapRow = {
  provider_symbol: string;
  provider_kind: string;
};

type QueryFn = (sql: string, params?: Array<string | number | null>) => Promise<any[]>;
type ExecuteFn = (sql: string, params?: Array<string | number | null>) => Promise<unknown>;

function fxProviderSymbolFromKey(priceKey: string): string | null {
  const match = /^FX_USD_([A-Z]+)$/.exec(priceKey);
  if (!match) {
    return null;
  }
  return `USD${match[1]}`;
}

function monthFromDate(date: string): string {
  return date.slice(0, 7).replace("-", "");
}

function toPayload(rows: Array<{ date: string; close: number; open?: number; high?: number; low?: number; volume?: number }>): MonthlyPricePayload {
  return {
    dates: rows.map((row) => row.date),
    close: rows.map((row) => row.close),
    open: rows.some((row) => row.open !== undefined) ? rows.map((row) => row.open ?? null) : undefined,
    high: rows.some((row) => row.high !== undefined) ? rows.map((row) => row.high ?? null) : undefined,
    low: rows.some((row) => row.low !== undefined) ? rows.map((row) => row.low ?? null) : undefined,
    volume: rows.some((row) => row.volume !== undefined) ? rows.map((row) => row.volume ?? null) : undefined,
  };
}

async function defaultQuery(sql: string, params: Array<string | number | null> = []): Promise<any[]> {
  const db = await import("../../../api/_db.js");
  return db.query(sql, params);
}

async function defaultExecute(sql: string, params: Array<string | number | null> = []): Promise<unknown> {
  const db = await import("../../../api/_db.js");
  return db.execute(sql, params);
}

const refreshLocks = new Map<string, Promise<{ monthsTouched: number }>>();

export async function refreshHistoryRangeToMonthlyBlobs(args: {
  priceKey: PriceKey;
  from: string;
  to: string;
}, deps: {
  queryFn?: QueryFn;
  executeFn?: ExecuteFn;
  fetchHistoricalFn?: typeof fetchHistoricalEodFull;
} = {}): Promise<{ monthsTouched: number }> {
  const lockKey = `${args.priceKey}:${args.from}:${args.to}`;
  const existing = refreshLocks.get(lockKey);
  if (existing) {
    return existing;
  }

  const runPromise = (async () => {
    const queryFn = deps.queryFn ?? defaultQuery;
    const executeFn = deps.executeFn ?? defaultExecute;
    const fetchHistoricalFn = deps.fetchHistoricalFn ?? fetchHistoricalEodFull;

    const mappingRows = await queryFn(
      `SELECT provider_symbol, provider_kind
       FROM ${PRICE_PROVIDER_MAP_TABLE}
       WHERE price_key = ? AND provider = 'FMP'
       LIMIT 1`,
      [args.priceKey],
    ) as ProviderMapRow[];

    const mapping = mappingRows[0];
    const providerSymbol = mapping?.provider_symbol ?? fxProviderSymbolFromKey(args.priceKey);
    if (!providerSymbol) {
      throw new Error(`No FMP mapping found for price key: ${args.priceKey}`);
    }

    const allRows = await fetchHistoricalFn(providerSymbol);
    const filtered = allRows.filter((row) => row.date >= args.from && row.date <= args.to);

    const byMonth = new Map<string, typeof filtered>();
    for (const row of filtered) {
      const yyyymm = monthFromDate(row.date);
      byMonth.set(yyyymm, [...(byMonth.get(yyyymm) ?? []), row]);
    }

    let monthsTouched = 0;

    for (const [yyyymm, monthRows] of byMonth.entries()) {
      const existingRows = await queryFn(
        `SELECT payload
         FROM ${PRICE_EOD_MONTHLY_TABLE}
         WHERE price_key = ? AND yyyymm = ?
         LIMIT 1`,
        [args.priceKey, yyyymm],
      ) as Array<{ payload: string }>;

      const incoming = toPayload(monthRows);
      const merged = existingRows[0]?.payload
        ? mergeMonthlyPayload(decodeMonthlyPayload(existingRows[0].payload), incoming)
        : incoming;

      await executeFn(
        `INSERT INTO ${PRICE_EOD_MONTHLY_TABLE}
          (price_key, yyyymm, encoding, payload, provider, source_symbol, updated_at_utc)
         VALUES (?, ?, 'json-v1', ?, 'FMP', ?, ?)
         ON CONFLICT(price_key, yyyymm) DO UPDATE SET
          encoding = excluded.encoding,
          payload = excluded.payload,
          provider = excluded.provider,
          source_symbol = excluded.source_symbol,
          updated_at_utc = excluded.updated_at_utc`,
        [args.priceKey, yyyymm, encodeMonthlyPayload(merged), providerSymbol, new Date().toISOString()],
      );
      monthsTouched += 1;
    }

    return { monthsTouched };
  })();

  refreshLocks.set(lockKey, runPromise);
  try {
    return await runPromise;
  } finally {
    refreshLocks.delete(lockKey);
  }
}
