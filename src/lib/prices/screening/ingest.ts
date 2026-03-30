import { execute, query } from "../../../../api/_db.js";
import { fetchApiV3Json } from "../../../../api/_fmp.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { computePriceScreenSnapshot, type DailyPriceRow, type PriceScreenSnapshotDebug, type PriceScreenSnapshotRow } from "./snapshotEngine.js";

const SCREENING_WORKING_WINDOW_ROWS = 120;
const INCREMENTAL_BUFFER_DAYS = 10;

interface FmpHistoricalResponse {
  historical?: Array<Record<string, unknown>>;
}

interface IngestSymbolResult {
  symbol: string;
  inserted: number;
  updated: number;
  unchanged: number;
  skipped: boolean;
  snapshotUpdated: boolean;
  snapshot?: PriceScreenSnapshotRow;
  debug?: PriceScreenSnapshotDebug;
}

function toIsoDateUtc(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDateUtc(date);
}

function normalizeHistoryRows(payload: FmpHistoricalResponse): DailyPriceRow[] {
  const history = Array.isArray(payload?.historical) ? payload.historical : [];
  return history
    .map((row): DailyPriceRow | null => {
      const date = typeof row.date === "string" ? row.date.slice(0, 10) : null;
      const close = typeof row.close === "number" ? row.close : null;
      if (!date || close === null || !Number.isFinite(close)) return null;
      return {
        symbol: "",
        price_date: date,
        close,
        adjusted_close: typeof row.adjClose === "number" && Number.isFinite(row.adjClose) ? row.adjClose : null,
        volume: typeof row.volume === "number" && Number.isFinite(row.volume) ? row.volume : null,
        source: "fmp",
        currency: null,
      };
    })
    .filter((row): row is DailyPriceRow => row !== null)
    .sort((a, b) => a.price_date.localeCompare(b.price_date));
}

function dedupeByPriceDate(rows: DailyPriceRow[]): DailyPriceRow[] {
  const byDate = new Map<string, DailyPriceRow>();
  for (const row of rows) {
    byDate.set(row.price_date, row);
  }
  return Array.from(byDate.values()).sort((a, b) => a.price_date.localeCompare(b.price_date));
}

function equalNumberish(a: unknown, b: unknown): boolean {
  if (a === null && b === null) return true;
  if (typeof a !== "number" || typeof b !== "number") return false;
  return Math.abs(a - b) < 1e-10;
}

async function readLatestDate(symbol: string): Promise<string | null> {
  const rows = await query(
    `SELECT MAX(price_date) as last_date
     FROM ${tables.dailyPriceHistory}
     WHERE symbol = ?`,
    [symbol],
  ) as Array<{ last_date?: string | null }>;
  const value = rows[0]?.last_date;
  return typeof value === "string" && value.length === 10 ? value : null;
}

async function upsertSnapshotIfChanged(next: PriceScreenSnapshotRow): Promise<boolean> {
  const existingRows = await query(
    `SELECT * FROM ${tables.priceScreenSnapshot} WHERE symbol = ? LIMIT 1`,
    [next.symbol],
  ) as Array<Record<string, unknown>>;
  const existing = existingRows[0] ?? null;

  const keys: Array<keyof PriceScreenSnapshotRow> = [
    "as_of_date", "last_close", "return_5d", "return_20d", "return_60d", "high_20d", "high_60d",
    "drawdown_20d", "drawdown_60d", "ma20", "ma50", "trend_state", "recovery_state", "history_points_used", "source",
  ];

  if (existing) {
    const changed = keys.some((key) => {
      const before = existing[key as string] as unknown;
      const after = next[key];
      if (typeof after === "number" || typeof before === "number") {
        return !equalNumberish(typeof before === "number" ? before : null, typeof after === "number" ? after : null);
      }
      return (before ?? null) !== (after ?? null);
    });
    if (!changed) return false;
  }

  await execute(
    `INSERT INTO ${tables.priceScreenSnapshot}
      (symbol, as_of_date, last_close, return_5d, return_20d, return_60d, high_20d, high_60d, drawdown_20d, drawdown_60d, ma20, ma50, trend_state, recovery_state, history_points_used, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
      as_of_date = excluded.as_of_date,
      last_close = excluded.last_close,
      return_5d = excluded.return_5d,
      return_20d = excluded.return_20d,
      return_60d = excluded.return_60d,
      high_20d = excluded.high_20d,
      high_60d = excluded.high_60d,
      drawdown_20d = excluded.drawdown_20d,
      drawdown_60d = excluded.drawdown_60d,
      ma20 = excluded.ma20,
      ma50 = excluded.ma50,
      trend_state = excluded.trend_state,
      recovery_state = excluded.recovery_state,
      history_points_used = excluded.history_points_used,
      source = excluded.source,
      updated_at = excluded.updated_at`,
    [
      next.symbol,
      next.as_of_date,
      next.last_close,
      next.return_5d,
      next.return_20d,
      next.return_60d,
      next.high_20d,
      next.high_60d,
      next.drawdown_20d,
      next.drawdown_60d,
      next.ma20,
      next.ma50,
      next.trend_state,
      next.recovery_state,
      next.history_points_used,
      next.source,
      next.updated_at,
    ],
  );

  return true;
}

export async function ingestDailyPricesAndRefreshSnapshot(symbol: string, debug = false): Promise<IngestSymbolResult> {
  await ensureSchema();

  const normalized = symbol.trim().toUpperCase();
  if (!normalized) {
    throw new Error("symbol is required");
  }

  const latestLocalDate = await readLatestDate(normalized);
  const fetchFrom = latestLocalDate ? addDays(latestLocalDate, -INCREMENTAL_BUFFER_DAYS) : addDays(toIsoDateUtc(new Date()), -3650);
  const fetchTo = toIsoDateUtc(new Date());

  const payload = await fetchApiV3Json<FmpHistoricalResponse>(`historical-price-full/${encodeURIComponent(normalized)}`, {
    from: fetchFrom,
    to: fetchTo,
  });

  const incoming = dedupeByPriceDate(
    normalizeHistoryRows(payload).map((row) => ({ ...row, symbol: normalized })),
  );
  if (incoming.length === 0) {
    return { symbol: normalized, inserted: 0, updated: 0, unchanged: 0, skipped: true, snapshotUpdated: false };
  }

  const existingRows = await query(
    `SELECT symbol, price_date, close, adjusted_close, volume, source, currency
     FROM ${tables.dailyPriceHistory}
     WHERE symbol = ? AND price_date >= ? AND price_date <= ?`,
    [normalized, incoming[0].price_date, incoming[incoming.length - 1].price_date],
  ) as unknown as DailyPriceRow[];

  const existingByDate = new Map(existingRows.map((row) => [row.price_date, row]));
  const now = new Date().toISOString();

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of incoming) {
    const existing = existingByDate.get(row.price_date);
    if (!existing) {
      await execute(
        `INSERT INTO ${tables.dailyPriceHistory}
          (symbol, price_date, close, adjusted_close, volume, source, currency, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(symbol, price_date) DO UPDATE SET
           close = excluded.close,
           adjusted_close = excluded.adjusted_close,
           volume = excluded.volume,
           source = excluded.source,
           currency = excluded.currency,
           updated_at = excluded.updated_at`,
        [row.symbol, row.price_date, row.close, row.adjusted_close, row.volume, row.source, row.currency, now, now],
      );
      inserted += 1;
      existingByDate.set(row.price_date, row);
      continue;
    }

    const same = equalNumberish(existing.close, row.close)
      && equalNumberish(existing.adjusted_close, row.adjusted_close)
      && equalNumberish(existing.volume, row.volume)
      && (existing.source ?? null) === (row.source ?? null)
      && (existing.currency ?? null) === (row.currency ?? null);

    if (same) {
      unchanged += 1;
      continue;
    }

    await execute(
      `UPDATE ${tables.dailyPriceHistory}
       SET close = ?, adjusted_close = ?, volume = ?, source = ?, currency = ?, updated_at = ?
       WHERE symbol = ? AND price_date = ?`,
      [row.close, row.adjusted_close, row.volume, row.source, row.currency, now, row.symbol, row.price_date],
    );
    updated += 1;
  }

  const changed = inserted > 0 || updated > 0;
  if (!changed) {
    return {
      symbol: normalized,
      inserted,
      updated,
      unchanged,
      skipped: false,
      snapshotUpdated: false,
    };
  }

  const historyRows = await query(
    `SELECT symbol, price_date, close, adjusted_close, volume, source, currency
     FROM ${tables.dailyPriceHistory}
     WHERE symbol = ?
     ORDER BY price_date DESC
     LIMIT ?`,
    [normalized, SCREENING_WORKING_WINDOW_ROWS],
  ) as unknown as DailyPriceRow[];

  const ascRows = [...historyRows].sort((a, b) => a.price_date.localeCompare(b.price_date));
  const { snapshot, debug: debugData } = computePriceScreenSnapshot(normalized, ascRows);
  const snapshotUpdated = await upsertSnapshotIfChanged(snapshot);

  return {
    symbol: normalized,
    inserted,
    updated,
    unchanged,
    skipped: false,
    snapshotUpdated,
    ...(debug ? { snapshot, debug: debugData } : {}),
  };
}

export async function ingestManySymbols(args: { symbols: string[]; debug?: boolean }) {
  const results: IngestSymbolResult[] = [];
  const failures: Array<{ symbol: string; error: string }> = [];
  for (const symbol of args.symbols) {
    try {
      const item = await ingestDailyPricesAndRefreshSnapshot(symbol, Boolean(args.debug));
      results.push(item);
    } catch (error) {
      failures.push({ symbol, error: (error as Error).message });
    }
  }
  return {
    ok: failures.length === 0,
    total: args.symbols.length,
    succeeded: results.length,
    failed: failures.length,
    changedSymbols: results.filter((item) => item.inserted > 0 || item.updated > 0).length,
    writtenDailyRows: results.reduce((acc, item) => acc + item.inserted + item.updated, 0),
    snapshotWrites: results.filter((item) => item.snapshotUpdated).length,
    results,
    failures,
  };
}
