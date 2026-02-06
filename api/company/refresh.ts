import { assertCronSecret } from "../_auth.js";
import { execute } from "../_db.js";
import {
  fetchStatement,
  normalizeFinancialPoints,
  PeriodType,
  StatementType,
  requireFmpApiKey,
} from "../_fmp.js";

const STATEMENTS: StatementType[] = ["income", "balance", "cashflow"];

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
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    const ticker = typeof req.body?.ticker === "string" ? req.body.ticker.trim().toUpperCase() : "";
    if (!ticker) {
      res.status(400).json({ ok: false, error: "Ticker is required" });
      return;
    }

    const annual = req.body?.annual !== false;
    const quarterly = req.body?.quarterly !== false;

    const results: Record<string, Record<string, number>> = {};

    if (annual) {
      results.annual = await refreshTicker(ticker, "annual");
      await execute(
        `UPDATE companies SET last_annual_fetch_at = ? WHERE ticker = ?`,
        [new Date().toISOString(), ticker]
      );
    }

    if (quarterly) {
      results.quarterly = await refreshTicker(ticker, "quarterly");
      await execute(
        `UPDATE companies SET last_quarterly_fetch_at = ? WHERE ticker = ?`,
        [new Date().toISOString(), ticker]
      );
    }

    res.status(200).json({ ok: true, ticker, results });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
