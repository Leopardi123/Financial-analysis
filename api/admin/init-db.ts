import { assertCronSecret } from "../_auth.js";
import { execute } from "../_db";

export default async function handler(req: any, res: any) {
  try {
    assertCronSecret(req);

    await execute(
      `CREATE TABLE IF NOT EXISTS companies (
        ticker TEXT PRIMARY KEY,
        active INTEGER DEFAULT 1,
        last_annual_fetch_at TEXT,
        last_quarterly_fetch_at TEXT
      )`
    );

    await execute(
      `CREATE TABLE IF NOT EXISTS financial_points (
        ticker TEXT,
        statement TEXT,
        period TEXT,
        fiscal_date TEXT,
        field TEXT,
        value REAL,
        currency TEXT,
        PRIMARY KEY (ticker, statement, period, fiscal_date, field)
      )`
    );

    await execute(
      `CREATE TABLE IF NOT EXISTS fetch_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_at TEXT,
        ticker TEXT,
        period TEXT,
        statement TEXT,
        ok INTEGER,
        error TEXT
      )`
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
