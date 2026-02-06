import { assertCronSecret } from "../_auth.js";
import { execute, query } from "../_db.js";
import {
  fetchStatement,
  normalizeFinancialPoints,
  PeriodType,
  StatementType,
} from "../_fmp";

const STATEMENTS: StatementType[] = ["income", "balance", "cashflow"];
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CALLS = 120;

function isStale(value: string | null, days: number) {
  if (!value) {
    return true;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return true;
  }
  return Date.now() - date.getTime() > days * DAY_MS;
}

async function upsertPoints(points: ReturnType<typeof normalizeFinancialPoints>) {
  for (const point of points) {
    await execute(
      `INSERT INTO financial_points (ticker, statement, period, fiscal_date, field, value, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker, statement, period, fiscal_date, field)
       DO UPDATE SET value = excluded.value, currency = excluded.currency`,
      [
        point.ticker,
        point.statement,
        point.period,
        point.fiscalDate,
        point.field,
        point.value,
        point.currency,
      ]
    );
  }
}

async function logFetch(
  ticker: string,
  period: PeriodType,
  statement: StatementType,
  ok: boolean,
  error?: string,
) {
  await execute(
    `INSERT INTO fetch_log (run_at, ticker, period, statement, ok, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [new Date().toISOString(), ticker, period, statement, ok ? 1 : 0, error ?? null]
  );
}

async function refreshTicker(ticker: string, period: PeriodType) {
  const summary: Record<string, number> = {};

  for (const statement of STATEMENTS) {
    try {
      const rows = await fetchStatement(ticker, statement, period);
      const points = normalizeFinancialPoints(ticker, statement, period, rows);
      await upsertPoints(points);
      await logFetch(ticker, period, statement, true);
      summary[statement] = points.length;
    } catch (error) {
      await logFetch(ticker, period, statement, false, (error as Error).message);
      summary[statement] = 0;
    }
  }

  return summary;
}

export default async function handler(req: any, res: any) {
  try {
    assertCronSecret(req);

    const companies = await query(
      `SELECT ticker, last_annual_fetch_at, last_quarterly_fetch_at
       FROM companies
       WHERE active = 1`
    );

    const quarterlyQueue: string[] = [];
    const annualQueue: string[] = [];

    for (const company of companies) {
      const ticker = String(company.ticker ?? "");
      if (!ticker) {
        continue;
      }
      const lastAnnual = company.last_annual_fetch_at as string | null;
      const lastQuarterly = company.last_quarterly_fetch_at as string | null;

      if (isStale(lastQuarterly, 90)) {
        quarterlyQueue.push(ticker);
      }
      if (isStale(lastAnnual, 365)) {
        annualQueue.push(ticker);
      }
    }

    const maxPeriods = Math.floor(MAX_CALLS / STATEMENTS.length);
    const queue: Array<{ ticker: string; period: PeriodType }> = [];

    for (const ticker of quarterlyQueue) {
      if (queue.length >= maxPeriods) {
        break;
      }
      queue.push({ ticker, period: "quarterly" });
    }

    for (const ticker of annualQueue) {
      if (queue.length >= maxPeriods) {
        break;
      }
      queue.push({ ticker, period: "annual" });
    }

    const processed: Array<{
      ticker: string;
      period: PeriodType;
      results: Record<string, number>;
    }> = [];

    for (const item of queue) {
      const results = await refreshTicker(item.ticker, item.period);
      processed.push({ ...item, results });

      if (item.period === "annual") {
        await execute(
          `UPDATE companies SET last_annual_fetch_at = ? WHERE ticker = ?`,
          [new Date().toISOString(), item.ticker]
        );
      } else {
        await execute(
          `UPDATE companies SET last_quarterly_fetch_at = ? WHERE ticker = ?`,
          [new Date().toISOString(), item.ticker]
        );
      }
    }

    res.status(200).json({
      ok: true,
      budget: {
        maxCalls: MAX_CALLS,
        usedCalls: queue.length * STATEMENTS.length,
      },
      processed,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
