import { query } from "../_db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isStale(value: string | null, days: number) {
  const date = parseDate(value);
  if (!date) {
    return true;
  }
  return Date.now() - date.getTime() > days * DAY_MS;
}

export default async function handler(req: any, res: any) {
  try {
    const ticker = typeof req.query?.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
    const period = req.query?.period === "quarterly" ? "quarterly" : "annual";

    if (!ticker) {
      res.status(400).json({ ok: false, error: "Ticker is required" });
      return;
    }

    const companyRows = await query(
      `SELECT last_annual_fetch_at, last_quarterly_fetch_at
       FROM companies WHERE ticker = ?`,
      [ticker]
    );
    const company = companyRows[0] as
      | { last_annual_fetch_at: string | null; last_quarterly_fetch_at: string | null }
      | undefined;

    const rows = await query(
      `SELECT statement, fiscal_date, field, value
       FROM financial_points
       WHERE ticker = ? AND period = ?
       ORDER BY fiscal_date ASC`,
      [ticker, period]
    );

    const yearSet = new Set<number>();
    for (const row of rows) {
      const fiscalDate = String(row.fiscal_date ?? "");
      if (!fiscalDate) {
        continue;
      }
      const year = Number(fiscalDate.slice(0, 4));
      if (!Number.isNaN(year)) {
        yearSet.add(year);
      }
    }

    const years = Array.from(yearSet).sort((a, b) => a - b);
    const yearIndex = new Map<number, number>();
    years.forEach((year, index) => yearIndex.set(year, index));

    const statements = {
      income: {} as Record<string, Array<number | null>>,
      balance: {} as Record<string, Array<number | null>>,
      cashflow: {} as Record<string, Array<number | null>>,
    };

    for (const row of rows) {
      const statement = String(row.statement ?? "");
      if (statement !== "income" && statement !== "balance" && statement !== "cashflow") {
        continue;
      }
      const field = String(row.field ?? "");
      if (!field) {
        continue;
      }
      const fiscalDate = String(row.fiscal_date ?? "");
      const year = Number(fiscalDate.slice(0, 4));
      const index = yearIndex.get(year);
      if (index === undefined) {
        continue;
      }

      if (!statements[statement][field]) {
        statements[statement][field] = Array.from({ length: years.length }, () => null);
      }
      statements[statement][field][index] = Number(row.value ?? null);
    }

    res.status(200).json({
      ticker,
      period,
      years,
      income: statements.income,
      balance: statements.balance,
      cashflow: statements.cashflow,
      meta: {
        lastAnnualFetchAt: company?.last_annual_fetch_at ?? null,
        lastQuarterlyFetchAt: company?.last_quarterly_fetch_at ?? null,
        staleAnnual: isStale(company?.last_annual_fetch_at ?? null, 365),
        staleQuarterly: isStale(company?.last_quarterly_fetch_at ?? null, 90),
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
