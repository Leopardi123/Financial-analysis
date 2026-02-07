import { assertCronSecret } from "../_auth.js";
import { batch, execute, query } from "../_db.js";
import {
  fetchStatement,
  normalizeFinancialPoints,
  PeriodType,
  StatementType,
  requireFmpApiKey,
} from "../_fmp.js";
import { ensureSchema, tables } from "../_migrate.js";

const STATEMENTS: StatementType[] = ["income", "balance", "cashflow"];
const PERIODS: PeriodType[] = ["fy", "q"];
const MAX_POINTS_PER_RUN = 10000;
const REPORT_BATCH_SIZE = 30;

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

async function upsertReports(
  companyId: number,
  ticker: string,
  statement: StatementType,
  period: PeriodType,
  reports: Array<Record<string, unknown>>,
) {
  const now = new Date().toISOString();
  const statements = reports
    .map((report) => {
      const fiscalDate = String(report.date ?? "");
      if (!fiscalDate) {
        return null;
      }
      return {
        sql: `INSERT INTO ${tables.financialReports}
          (company_id, statement, period, fiscal_date, data_json, source, fetched_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'fmp', ?, ?)
          ON CONFLICT(company_id, statement, period, fiscal_date)
          DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
        args: [companyId, statement, period, fiscalDate, JSON.stringify(report), now, now],
      };
    })
    .filter(Boolean) as Array<{ sql: string; args: Array<string | number | null> }>;

  if (statements.length > 0) {
    await batch(statements);
  }
  await logFetch(ticker, period, statement, true);
  return statements.length;
}

async function materializeReports(params: {
  companyId: number;
  statement: StatementType;
  period: PeriodType;
  offset: number;
  limit: number;
  maxPoints: number;
}) {
  const rows = await query(
    `SELECT fiscal_date, data_json, fetched_at
     FROM ${tables.financialReports}
     WHERE company_id = ? AND statement = ? AND period = ?
     ORDER BY fiscal_date ASC
     LIMIT ? OFFSET ?`,
    [params.companyId, params.statement, params.period, params.limit, params.offset]
  );

  let inserted = 0;
  let batchStatements: Array<{ sql: string; args: Array<string | number | null> }> = [];

  for (const row of rows) {
    const report = JSON.parse(String(row.data_json ?? "{}")) as Record<string, unknown>;
    const fiscalDate = String(row.fiscal_date ?? "");
    const fetchedAt = String(row.fetched_at ?? new Date().toISOString());
    if (!fiscalDate) {
      continue;
    }

    const points = normalizeFinancialPoints(
      String(params.companyId),
      params.statement,
      params.period,
      [report]
    );

    for (const point of points) {
      batchStatements.push({
        sql: `INSERT INTO ${tables.financialPoints}
          (company_id, statement, period, fiscal_date, field, value, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(company_id, statement, period, fiscal_date, field)
          DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`,
        args: [
          params.companyId,
          point.statement,
          point.period,
          fiscalDate,
          point.field,
          point.value,
          fetchedAt,
        ],
      });
      inserted += 1;
      if (batchStatements.length >= 400) {
        await batch(batchStatements);
        batchStatements = [];
      }
      if (inserted >= params.maxPoints) {
        break;
      }
    }
    if (inserted >= params.maxPoints) {
      break;
    }
  }

  if (batchStatements.length > 0) {
    await batch(batchStatements);
  }

  const nextOffset = params.offset + rows.length;
  const done = rows.length < params.limit && inserted < params.maxPoints;
  return { inserted, nextOffset, done };
}

export default async function handler(req: any, res: any) {
  try {
    assertCronSecret(req);
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    await ensureSchema();

    const ticker = typeof req.body?.ticker === "string" ? req.body.ticker.trim().toUpperCase() : "";
    if (!ticker) {
      res.status(400).json({ ok: false, error: "Ticker is required" });
      return;
    }

    const companyRows = await query(
      `SELECT id FROM ${tables.companiesV2} WHERE ticker = ?`,
      [ticker]
    );
    const companyId = Number(companyRows[0]?.id ?? 0);
    if (!companyId) {
      res.status(404).json({ ok: false, error: "Ticker not found. Upsert it first." });
      return;
    }

    const skipFetch = Boolean(req.body?.skipFetch);
    const cursor = (req.body?.cursor ?? null) as
      | { statement: StatementType; period: PeriodType; offset: number }
      | null;

    const rawSummary: Record<string, number> = {};

    if (!skipFetch) {
      for (const period of PERIODS) {
        for (const statement of STATEMENTS) {
          try {
            const rows = await fetchStatement(ticker, statement, period);
            const inserted = await upsertReports(companyId, ticker, statement, period, rows);
            rawSummary[`${statement}_${period}`] = inserted;
          } catch (error) {
            await logFetch(ticker, period, statement, false, (error as Error).message);
            rawSummary[`${statement}_${period}`] = 0;
          }
        }
      }
    }

    const startTime = Date.now();
    let materialized = 0;
    let nextCursor: { statement: StatementType; period: PeriodType; offset: number } | null = null;
    let done = true;

    const targets: Array<{ statement: StatementType; period: PeriodType }> = [];
    for (const period of PERIODS) {
      for (const statement of STATEMENTS) {
        targets.push({ statement, period });
      }
    }

    let started = cursor ? false : true;
    for (const target of targets) {
      if (cursor && !started) {
        if (cursor.statement === target.statement && cursor.period === target.period) {
          started = true;
        } else {
          continue;
        }
      }
      const offset =
        cursor && cursor.statement === target.statement && cursor.period === target.period
          ? cursor.offset
          : 0;
      const { inserted, nextOffset, done: targetDone } = await materializeReports({
        companyId,
        statement: target.statement,
        period: target.period,
        offset,
        limit: REPORT_BATCH_SIZE,
        maxPoints: MAX_POINTS_PER_RUN - materialized,
      });
      materialized += inserted;
      if (!targetDone) {
        done = false;
        nextCursor = { statement: target.statement, period: target.period, offset: nextOffset };
        break;
      }
      if (materialized >= MAX_POINTS_PER_RUN || Date.now() - startTime > 45000) {
        done = false;
        nextCursor = { statement: target.statement, period: target.period, offset: nextOffset };
        break;
      }
    }

    const now = new Date().toISOString();
    await execute(
      `UPDATE ${tables.companiesV2}
       SET last_fy_fetch_at = ?, last_q_fetch_at = ?
       WHERE id = ?`,
      [now, now, companyId]
    );

    res.status(200).json({
      ok: true,
      ticker,
      phase: done ? "materialized_done" : "materialized_partial",
      raw: rawSummary,
      materialization: { cursor: nextCursor, done, inserted: materialized },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
