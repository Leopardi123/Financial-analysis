import { decodeMonthlyPayload } from "../historyBlob.ts";
import type { PriceKey } from "../keys.ts";

const PRICE_EOD_MONTHLY_TABLE = "price_eod_monthly";

type QueryFn = (sql: string, params?: Array<string | number | null>) => Promise<any[]>;

export interface HistoryRow {
  date: string;
  close: number;
}

function monthKey(date: string): string {
  return date.slice(0, 7).replace("-", "");
}

function enumerateMonths(from: string, to: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);

  while (cursor <= end) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    result.push(`${y}${m}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return result;
}

async function defaultQuery(sql: string, params: Array<string | number | null> = []): Promise<any[]> {
  const db = await import("../../../../api/_db.ts");
  return db.query(sql, params);
}

export async function readHistoryRowsInRange(args: {
  priceKey: PriceKey;
  from: string;
  to: string;
}, deps: { queryFn?: QueryFn } = {}): Promise<{ rows: HistoryRow[]; missing: boolean }> {
  const months = enumerateMonths(args.from, args.to);
  if (months.length === 0) {
    return { rows: [], missing: false };
  }

  const queryFn = deps.queryFn ?? defaultQuery;

  const placeholders = months.map(() => "?").join(", ");
  const records = await queryFn(
    `SELECT yyyymm, payload
     FROM ${PRICE_EOD_MONTHLY_TABLE}
     WHERE price_key = ? AND yyyymm IN (${placeholders})`,
    [args.priceKey, ...months],
  ) as Array<{ yyyymm: string; payload: string }>;

  const returnedMonths = new Set(records.map((record) => String(record.yyyymm)));
  const missing = months.some((month) => !returnedMonths.has(month));

  const mergedByDate = new Map<string, number>();

  for (const record of records) {
    const payload = decodeMonthlyPayload(record.payload);
    for (let i = 0; i < payload.dates.length; i += 1) {
      const date = payload.dates[i];
      if (date < args.from || date > args.to) {
        continue;
      }
      if (monthKey(date) !== record.yyyymm) {
        continue;
      }
      mergedByDate.set(date, payload.close[i]);
    }
  }

  const rows = [...mergedByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, close]) => ({ date, close }));

  return { rows, missing };
}
