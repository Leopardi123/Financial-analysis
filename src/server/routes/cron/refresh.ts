import { batch, execute, query } from "../../../../api/_db.js";
import {
  fetchStatement,
  PeriodType,
  StatementType,
  requireFmpApiKey,
} from "../../../../api/_fmp.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { getCoverageCounts, materializeReports, toFiscalDateCutoffIso } from "../../materialization/materializeReportsCore.js";

const STATEMENTS: StatementType[] = ["balance", "income", "cashflow"];
const MAX_CALLS = 120;
const MAX_POINTS_PER_RUN = 10000;
const REPORT_BATCH_SIZE = 30;
const LOCK_TTL_MS = 45 * 60 * 1000;
const LOCK_TICKER = "__cron_refresh_lock__";
const LOCK_PERIOD = "lock";
const LOCK_STATEMENT = "refresh";
const PERIODS: PeriodType[] = ["q", "fy"];

function isCronAuthorized(req: { headers: Record<string, string | string[] | undefined> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }
  const authorization = req.headers.authorization;
  const bearer = Array.isArray(authorization) ? authorization[0] : authorization;
  return bearer === `Bearer ${secret}`;
}

async function acquireCronLock(runId: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  const lockThresholdIso = new Date(now.getTime() - LOCK_TTL_MS).toISOString();

  await execute(
    `DELETE FROM ${tables.fetchLog}
     WHERE ticker = ?
       AND period = ?
       AND statement = ?
       AND run_at < ?`,
    [LOCK_TICKER, LOCK_PERIOD, LOCK_STATEMENT, lockThresholdIso]
  );

  const inserted = await execute(
    `INSERT INTO ${tables.fetchLog} (run_at, ticker, period, statement, ok, error)
     SELECT ?, ?, ?, ?, 1, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM ${tables.fetchLog}
       WHERE ticker = ? AND period = ? AND statement = ? AND run_at >= ?
     )`,
    [
      nowIso,
      LOCK_TICKER,
      LOCK_PERIOD,
      LOCK_STATEMENT,
      runId,
      LOCK_TICKER,
      LOCK_PERIOD,
      LOCK_STATEMENT,
      lockThresholdIso,
    ]
  );

  return (inserted.rowsAffected ?? 0) > 0;
}

async function releaseCronLock(runId: string) {
  await execute(
    `DELETE FROM ${tables.fetchLog}
     WHERE ticker = ? AND period = ? AND statement = ? AND error = ?`,
    [LOCK_TICKER, LOCK_PERIOD, LOCK_STATEMENT, runId]
  );
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

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!isCronAuthorized(req)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let lockAcquired = false;

  try {
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    await ensureSchema();

    lockAcquired = await acquireCronLock(runId);

    console.info("[company-refresh]", {
      stage: "cron_materialization_path",
      path: "/api/cron/refresh",
      invokedFunction: "materializeReportsCore",
      cutoffEnabled: true,
      preflightEnabled: true,
      pointsTable: tables.financialPoints,
      lock: lockAcquired ? "acquired" : "skipped",
    });

    if (!lockAcquired) {
      res.status(200).json({ ok: true, skipped: true, reason: "lock_held" });
      return;
    }

    const companies = await query(
      `SELECT id, ticker
       FROM ${tables.companiesV2}
       WHERE active = 1`
    );

    const maxPeriods = Math.floor(MAX_CALLS / STATEMENTS.length);
    const queue: Array<{ companyId: number; ticker: string; period: PeriodType }> = [];
    for (const company of companies) {
      const ticker = String(company.ticker ?? "");
      const companyId = Number(company.id ?? 0);
      if (!ticker || !companyId) {
        continue;
      }
      for (const period of PERIODS) {
        if (queue.length >= maxPeriods) {
          break;
        }
        queue.push({ companyId, ticker, period });
      }
      if (queue.length >= maxPeriods) {
        break;
      }
    }

    const cutoffDate = toFiscalDateCutoffIso();

    const processed: Array<{
      ticker: string;
      period: PeriodType;
      results: Record<string, number>;
      latestChecks: Record<string, string>;
      materialization: Array<{
        statement: StatementType;
        inserted: number;
        done: boolean;
        cursor: number;
      }>;
    }> = [];

    for (const item of queue) {
      if (!item.companyId) {
        continue;
      }
      const results: Record<string, number> = {};
      const latestChecks: Record<string, string> = {};
      const changedStatements = new Set<StatementType>();

      const existingRows = await query(
        `SELECT statement, MAX(fiscal_date) AS latest_fiscal_date
         FROM ${tables.financialReports}
         WHERE company_id = ? AND period = ?
         GROUP BY statement`,
        [item.companyId, item.period]
      );
      const latestByStatement = new Map<StatementType, string>();
      for (const row of existingRows) {
        const statement = String(row.statement ?? "") as StatementType;
        const latestFiscalDate = String(row.latest_fiscal_date ?? "");
        if (STATEMENTS.includes(statement) && latestFiscalDate) {
          latestByStatement.set(statement, latestFiscalDate);
        }
      }

      for (const statement of STATEMENTS) {
        try {
          const rows = await fetchStatement(item.ticker, statement, item.period);
          const latestIncoming = String(rows[0]?.date ?? "");
          const latestStored = latestByStatement.get(statement) ?? "";
          if (!latestIncoming) {
            latestChecks[statement] = "no_fmp_data";
            results[statement] = 0;
            continue;
          }
          if (latestIncoming <= latestStored) {
            latestChecks[statement] = "no_new_report";
            results[statement] = 0;
            continue;
          }

          const inserted = await upsertReports(item.companyId, item.ticker, statement, item.period, rows);
          latestChecks[statement] = "new_report_detected";
          changedStatements.add(statement);
          results[statement] = inserted;
        } catch (error) {
          await logFetch(item.ticker, item.period, statement, false, (error as Error).message);
          latestChecks[statement] = "check_failed";
          results[statement] = 0;
        }
      }

      let remaining = MAX_POINTS_PER_RUN;
      const materialization: Array<{
        statement: StatementType;
        inserted: number;
        done: boolean;
        cursor: number;
      }> = [];
      let periodComplete = true;
      let newestFiscalDateProcessed = true;
      for (const statement of STATEMENTS) {
        if (!changedStatements.has(statement)) {
          materialization.push({ statement, inserted: 0, done: true, cursor: 0 });
          continue;
        }
        if (remaining <= 0) {
          periodComplete = false;
          materialization.push({ statement, inserted: 0, done: false, cursor: 0 });
          continue;
        }
        const { reportsDatesCount, pointsDatesCount } = await getCoverageCounts({
          companyId: item.companyId,
          statement,
          period: item.period,
          cutoffDate,
        });
        console.info("[company-refresh]", {
          stage: "materialization_target_preflight",
          statement,
          period: item.period,
          reportsDatesCount,
          pointsDatesCount,
          cutoffDate,
        });

        if (reportsDatesCount === 0 || pointsDatesCount >= reportsDatesCount) {
          console.info("[company-refresh]", {
            stage: "materialization_target_skipped",
            statement,
            period: item.period,
            reportsDatesCount,
            pointsDatesCount,
            reason: reportsDatesCount === 0 ? "no_reports" : "date_coverage_reached",
          });
          materialization.push({ statement, inserted: 0, done: true, cursor: 0 });
          continue;
        }

        const { inserted, nextOffset, done, newestFiscalDateProcessed: statementNewestProcessed } = await materializeReports({
          companyId: item.companyId,
          statement,
          period: item.period,
          offset: 0,
          limit: REPORT_BATCH_SIZE,
          maxPoints: remaining,
          cutoffDate,
        });
        remaining -= inserted;
        periodComplete = periodComplete && done;
        newestFiscalDateProcessed = newestFiscalDateProcessed && statementNewestProcessed;
        materialization.push({ statement, inserted, done, cursor: nextOffset });
      }

      processed.push({ ticker: item.ticker, period: item.period, results, latestChecks, materialization });

      if (item.period === "fy" && periodComplete && newestFiscalDateProcessed && changedStatements.size > 0) {
        await execute(
          `UPDATE ${tables.companiesV2} SET last_fy_fetch_at = ? WHERE id = ?`,
          [new Date().toISOString(), item.companyId]
        );
      } else if (item.period === "q" && periodComplete && newestFiscalDateProcessed && changedStatements.size > 0) {
        await execute(
          `UPDATE ${tables.companiesV2} SET last_q_fetch_at = ? WHERE id = ?`,
          [new Date().toISOString(), item.companyId]
        );
      }
    }

    res.status(200).json({
      ok: true,
      budget: {
        maxCalls: MAX_CALLS,
        usedCalls: queue.length * STATEMENTS.length,
      },
      processedCount: processed.length,
      processed,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  } finally {
    if (lockAcquired) {
      await releaseCronLock(runId);
    }
  }
}
