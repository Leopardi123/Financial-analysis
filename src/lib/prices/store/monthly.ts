export interface MonthlyRow {
  dateUtc: string;
  value: number;
}

type QueryFn = (sql: string, params?: Array<string | number | null>) => Promise<any[]>;
type ExecuteFn = (sql: string, params?: Array<string | number | null>) => Promise<unknown>;

function asMonthEnd(dateUtc: string): string {
  const d = new Date(`${dateUtc.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

export function downsampleDailyToMonthlyEom(rows: Array<{ dateUtc: string; value: number }>): MonthlyRow[] {
  const byMonth = new Map<string, { dateUtc: string; value: number }>();
  const sorted = [...rows].sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));

  for (const row of sorted) {
    const key = row.dateUtc.slice(0, 7);
    const current = byMonth.get(key);
    if (!current || current.dateUtc < row.dateUtc) {
      byMonth.set(key, row);
    }
  }

  return [...byMonth.values()]
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc))
    .map((row) => ({ dateUtc: asMonthEnd(row.dateUtc), value: row.value }));
}

async function defaultQuery(sql: string, params: Array<string | number | null> = []): Promise<any[]> {
  const db = await import('../../../../api/_db.js');
  return db.query(sql, params);
}

async function defaultExecute(sql: string, params: Array<string | number | null> = []): Promise<unknown> {
  const db = await import('../../../../api/_db.js');
  return db.execute(sql, params);
}

async function ensureTable(executeFn: ExecuteFn): Promise<void> {
  await executeFn(`CREATE TABLE IF NOT EXISTS price_history_monthly (
    price_key TEXT NOT NULL,
    date_utc TEXT NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY(price_key, date_utc)
  )`);
}

export async function getMonthlySeries(
  price_key: string,
  fromUtc: string,
  toUtc: string,
  deps: { queryFn?: QueryFn; executeFn?: ExecuteFn } = {},
): Promise<MonthlyRow[]> {
  const queryFn = deps.queryFn ?? defaultQuery;
  const executeFn = deps.executeFn ?? defaultExecute;
  await ensureTable(executeFn);
  const rows = await queryFn(
    `SELECT date_utc, value
     FROM price_history_monthly
     WHERE price_key = ? AND date_utc >= ? AND date_utc <= ?
     ORDER BY date_utc ASC`,
    [price_key, fromUtc, toUtc],
  ) as MonthlyRow[];
  return rows;
}

export async function findLastMonthlyDate(
  price_key: string,
  deps: { queryFn?: QueryFn; executeFn?: ExecuteFn } = {},
): Promise<string | null> {
  const queryFn = deps.queryFn ?? defaultQuery;
  const executeFn = deps.executeFn ?? defaultExecute;
  await ensureTable(executeFn);
  const rows = await queryFn(
    `SELECT date_utc
     FROM price_history_monthly
     WHERE price_key = ?
     ORDER BY date_utc DESC
     LIMIT 1`,
    [price_key],
  ) as Array<{ date_utc: string }>;

  return rows[0]?.date_utc ?? null;
}

export async function upsertMonthlySeries(
  price_key: string,
  rows: MonthlyRow[],
  deps: { queryFn?: QueryFn; executeFn?: ExecuteFn } = {},
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const queryFn = deps.queryFn ?? defaultQuery;
  const executeFn = deps.executeFn ?? defaultExecute;
  await ensureTable(executeFn);

  const existingRows = await queryFn(
    `SELECT date_utc, value
     FROM price_history_monthly
     WHERE price_key = ? AND date_utc >= ? AND date_utc <= ?`,
    [price_key, rows[0].dateUtc, rows[rows.length - 1].dateUtc],
  ) as Array<{ date_utc: string; value: number }>;
  const existing = new Map(existingRows.map((row) => [row.date_utc, row.value]));

  let writes = 0;
  for (const row of rows) {
    const prev = existing.get(row.dateUtc);
    if (prev !== undefined && prev === row.value) {
      continue;
    }
    await executeFn(
      `INSERT INTO price_history_monthly (price_key, date_utc, value)
       VALUES (?, ?, ?)
       ON CONFLICT(price_key, date_utc) DO UPDATE SET value = excluded.value`,
      [price_key, row.dateUtc, row.value],
    );
    writes += 1;
  }

  return writes;
}
