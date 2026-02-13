import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type CompanyRow = { id: number; last_fy_fetch_at: string | null; last_q_fetch_at: string | null };

function parseCompanyRow(row: unknown): CompanyRow | undefined {
  const candidate = row as { id?: unknown; last_fy_fetch_at?: unknown; last_q_fetch_at?: unknown } | null | undefined;
  const id = Number(candidate?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return undefined;
  }
  return {
    id,
    last_fy_fetch_at: candidate?.last_fy_fetch_at == null ? null : String(candidate.last_fy_fetch_at),
    last_q_fetch_at: candidate?.last_q_fetch_at == null ? null : String(candidate.last_q_fetch_at),
  };
}
const META_KEYS = new Set([
  "symbol",
  "date",
  "calendarYear",
  "period",
  "reportedCurrency",
  "cik",
  "fillingDate",
  "acceptedDate",
  "link",
  "finalLink",
]);

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseNumericValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "n/a") {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
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
    await ensureSchema();
    const ticker = typeof req.query?.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
    const period = req.query?.period === "quarterly" || req.query?.period === "q" ? "q" : "fy";

    if (!ticker) {
      res.status(400).json({ ok: false, error: "Ticker is required" });
      return;
    }

    const companyRows = await query(
      `SELECT id, last_fy_fetch_at, last_q_fetch_at
       FROM ${tables.companiesV2} WHERE ticker = ?`,
      [ticker]
    );
    const company = parseCompanyRow(companyRows[0]);
    if (!company?.id) {
      res.status(404).json({ ok: false, error: "Ticker not found" });
      return;
    }

    const rows = await query(
      `SELECT statement, fiscal_date, field, value
       FROM ${tables.financialPoints}
       WHERE company_id = ? AND period = ?
       ORDER BY fiscal_date ASC`,
      [company.id, period]
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
      const parsedValue = parseNumericValue(row.value);
      statements[statement][field][index] = parsedValue;
    }

    if (Object.keys(statements.balance).length === 0) {
      const reportRows = await query(
        `SELECT fiscal_date, data_json
         FROM ${tables.financialReports}
         WHERE company_id = ? AND statement = 'balance' AND period = ?
         ORDER BY fiscal_date ASC`,
        [company.id, period]
      );

      const reportYears = new Set<number>();
      for (const row of reportRows) {
        const fiscalDate = String(row.fiscal_date ?? "");
        if (!fiscalDate) {
          continue;
        }
        const year = Number(fiscalDate.slice(0, 4));
        if (!Number.isNaN(year)) {
          reportYears.add(year);
        }
      }

      if (reportYears.size > 0 && years.length === 0) {
        const reportYearList = Array.from(reportYears).sort((a, b) => a - b);
        years.splice(0, years.length, ...reportYearList);
        yearIndex.clear();
        years.forEach((year, index) => yearIndex.set(year, index));
      }

      for (const row of reportRows) {
        const fiscalDate = String(row.fiscal_date ?? "");
        if (!fiscalDate) {
          continue;
        }
        const year = Number(fiscalDate.slice(0, 4));
        const index = yearIndex.get(year);
        if (index === undefined) {
          continue;
        }
        const report = JSON.parse(String(row.data_json ?? "{}")) as Record<string, unknown>;
        for (const [key, value] of Object.entries(report)) {
          if (META_KEYS.has(key)) {
            continue;
          }
          if (typeof value === "number" && Number.isFinite(value)) {
            if (!statements.balance[key]) {
              statements.balance[key] = Array.from({ length: years.length }, () => null);
            }
            statements.balance[key][index] = value;
          }
        }
      }
    }

    res.status(200).json({
      ticker,
      period,
      years,
      income: statements.income,
      balance: statements.balance,
      cashflow: statements.cashflow,
      meta: {
        lastAnnualFetchAt: company?.last_fy_fetch_at ?? null,
        lastQuarterlyFetchAt: company?.last_q_fetch_at ?? null,
        staleAnnual: isStale(company?.last_fy_fetch_at ?? null, 365),
        staleQuarterly: isStale(company?.last_q_fetch_at ?? null, 90),
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
