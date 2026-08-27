import { mergeMonthlyPayload, encodeMonthlyPayload, decodeMonthlyPayload, type MonthlyPricePayload } from "./historyBlob.js";
import { fetchHistoricalEodFull, fetchLegacyCommodityHistoricalFull } from "./providers/fmp.js";
import { fetchFredCommodityPriceSeries, getFredCommodityPriceMapping } from "./providers/fred.js";
import { getPriceKeyDefinition, type PriceKey } from "./keys.js";
import { convertPriceToCanonical } from "./units/convert.js";

const PRICE_PROVIDER_MAP_TABLE = "price_provider_map";
const PRICE_EOD_MONTHLY_TABLE = "price_eod_monthly";

type ProviderMapRow = {
  provider: string;
  provider_symbol: string;
  provider_kind: string;
};

type HistoryInputRow = {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
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

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function toPayload(rows: HistoryInputRow[]): MonthlyPricePayload {
  return {
    dates: rows.map((row) => row.date),
    close: rows.map((row) => row.close),
    open: rows.some((row) => row.open !== undefined) ? rows.map((row) => row.open ?? null) : undefined,
    high: rows.some((row) => row.high !== undefined) ? rows.map((row) => row.high ?? null) : undefined,
    low: rows.some((row) => row.low !== undefined) ? rows.map((row) => row.low ?? null) : undefined,
    volume: rows.some((row) => row.volume !== undefined) ? rows.map((row) => row.volume ?? null) : undefined,
  };
}

function mergeHistoryRows(primary: HistoryInputRow[], fallback: HistoryInputRow[]): HistoryInputRow[] {
  const byDate = new Map<string, HistoryInputRow>();
  for (const row of fallback) byDate.set(row.date, row);
  for (const row of primary) byDate.set(row.date, row);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function hasMaterialLeadingGap(rows: HistoryInputRow[], requestedFrom: string): boolean {
  if (rows.length === 0) return true;
  const earliest = rows[0]?.date;
  if (!earliest) return true;
  const requested = Date.parse(`${requestedFrom}T00:00:00Z`);
  const observed = Date.parse(`${earliest}T00:00:00Z`);
  if (!Number.isFinite(requested) || !Number.isFinite(observed)) return false;
  return observed - requested > 45 * 86_400_000;
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
  fetchLegacyHistoricalFn?: typeof fetchLegacyCommodityHistoricalFull;
  fetchFredCommodityPriceSeriesFn?: typeof fetchFredCommodityPriceSeries;
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
    const fetchLegacyHistoricalFn = deps.fetchLegacyHistoricalFn ?? fetchLegacyCommodityHistoricalFull;
    const fetchFredFn = deps.fetchFredCommodityPriceSeriesFn ?? fetchFredCommodityPriceSeries;

    const mappingRows = await queryFn(
      `SELECT provider, provider_symbol, provider_kind
       FROM ${PRICE_PROVIDER_MAP_TABLE}
       WHERE price_key = ?
       LIMIT 1`,
      [args.priceKey],
    ) as ProviderMapRow[];

    const mapping = mappingRows[0] ?? null;
    const fredRegistryMapping = getFredCommodityPriceMapping(args.priceKey);
    const provider = String(
      mapping?.provider
      ?? (fredRegistryMapping ? "FRED" : fxProviderSymbolFromKey(args.priceKey) ? "FMP" : ""),
    ).toUpperCase();
    let providerSymbol = mapping?.provider_symbol ?? fredRegistryMapping?.fredSeriesId ?? null;
    let providerLabel: "FMP" | "FRED";
    let filtered: HistoryInputRow[];

    if (provider === "FMP") {
      providerSymbol = providerSymbol ?? fxProviderSymbolFromKey(args.priceKey);
      if (!providerSymbol) {
        throw new Error(`No FMP mapping found for price key: ${args.priceKey}`);
      }
      const allRows = await fetchHistoricalFn(providerSymbol);
      filtered = allRows.filter((row) => row.date >= args.from && row.date <= args.to);

      // The stable FMP full-history endpoint can return only the recent portion of a
      // requested commodity history. The repository already has the legacy v3
      // historical-price-full/{symbol}?from=&to= resolver, so use it as a verified
      // range backfill only when the stable result clearly starts materially after
      // the requested start date. Stable rows win on overlapping dates.
      if (hasMaterialLeadingGap(filtered, args.from)) {
        try {
          const legacyRows = await fetchLegacyHistoricalFn(providerSymbol, {
            fromUtc: args.from,
            toUtc: args.to,
          });
          const legacyFiltered = legacyRows.filter((row) => row.date >= args.from && row.date <= args.to);
          filtered = mergeHistoryRows(filtered, legacyFiltered);
        } catch {
          // Keep the valid stable history. Callers that require longer coverage
          // (e.g. Tier cycle resilience) will remain NOT_VERIFIED rather than guess.
        }
      }
      providerLabel = "FMP";
    } else if (provider === "FRED") {
      const fredMapping = getFredCommodityPriceMapping(args.priceKey);
      if (!fredMapping) {
        throw new Error(`No verified FRED commodity mapping found for price key: ${args.priceKey}`);
      }
      if (providerSymbol && providerSymbol !== fredMapping.fredSeriesId) {
        throw new Error(
          `FRED provider mapping mismatch for ${args.priceKey}: database=${providerSymbol}, registry=${fredMapping.fredSeriesId}`,
        );
      }
      providerSymbol = fredMapping.fredSeriesId;
      const definition = getPriceKeyDefinition(args.priceKey);
      const fredRows = await fetchFredFn(fredMapping, { fromUtc: monthStart(args.from), toUtc: args.to });
      filtered = fredRows
        .filter((row) => row.dateUtc >= args.from && row.dateUtc <= args.to)
        .map((row) => ({
          date: row.dateUtc,
          close: convertPriceToCanonical({
            value: row.close,
            fromUnit: fredMapping.providerUnit,
            canonicalUnit: definition.canonicalUnit,
          }),
        }));
      providerLabel = "FRED";
    } else {
      throw new Error(`Unsupported price history provider for ${args.priceKey}: ${provider || "missing"}`);
    }

    const byMonth = new Map<string, HistoryInputRow[]>();
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
         VALUES (?, ?, 'json-v1', ?, ?, ?, ?)
         ON CONFLICT(price_key, yyyymm) DO UPDATE SET
          encoding = excluded.encoding,
          payload = excluded.payload,
          provider = excluded.provider,
          source_symbol = excluded.source_symbol,
          updated_at_utc = excluded.updated_at_utc`,
        [args.priceKey, yyyymm, encodeMonthlyPayload(merged), providerLabel, providerSymbol, new Date().toISOString()],
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