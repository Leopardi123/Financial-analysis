import { assertCronSecret } from "../../../../api/_auth.js";
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
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CALLS = 120;
const MAX_POINTS_PER_RUN = 10000;
const REPORT_BATCH_SIZE = 30;

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
  try {
    assertCronSecret(req);
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    await ensureSchema();

    const companies = await query(
      `SELECT id, ticker, last_fy_fetch_at, last_q_fetch_at
       FROM ${tables.companiesV2}
       WHERE active = 1`
    );

    const quarterlyQueue: string[] = [];
    const annualQueue: string[] = [];
    const companyMap = new Map<string, number>();

    for (const company of companies) {
      const ticker = String(company.ticker ?? "");
      if (!ticker) {
        continue;
      }
      companyMap.set(ticker, Number(company.id ?? 0));
      const lastAnnual = company.last_fy_fetch_at as string | null;
      const lastQuarterly = company.last_q_fetch_at as string | null;

      if (isStale(lastQuarterly, 90)) {
        quarterlyQueue.push(ticker);
      }
      if (isStale(lastAnnual, 365)) {
        annualQueue.push(ticker);
      }
    }

    const maxPeriods = Math.floor(MAX_CALLS / STATEMENTS.length);
    const queue: Array<{ companyId: number; ticker: string; period: PeriodType }> = [];

    for (const ticker of quarterlyQueue) {
      if (queue.length >= maxPeriods) {
        break;
      }
      queue.push({ companyId: companyMap.get(ticker) ?? 0, ticker, period: "q" });
    }

    for (const ticker of annualQueue) {
      if (queue.length >= maxPeriods) {
        break;
      }
      queue.push({ companyId: companyMap.get(ticker) ?? 0, ticker, period: "fy" });
    }

    const cutoffDate = toFiscalDateCutoffIso();

    const processed: Array<{
      ticker: string;
      period: PeriodType;
      results: Record<string, number>;
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
      for (const statement of STATEMENTS) {
        try {
          const rows = await fetchStatement(item.ticker, statement, item.period);
          const inserted = await upsertReports(item.companyId, item.ticker, statement, item.period, rows);
          results[statement] = inserted;
        } catch (error) {
          await logFetch(item.ticker, item.period, statement, false, (error as Error).message);
          results[statement] = 0;
        }
      }

      console.info("[company-refresh]", {
        stage: "cron_materialization_path",
        invokedFunction: "materializeReportsCore",
        cutoffEnabled: true,
        preflightEnabled: true,
        pointsTable: tables.financialPoints,
      });

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

      processed.push({ ticker: item.ticker, period: item.period, results, materialization });

      if (item.period === "fy" && periodComplete && newestFiscalDateProcessed) {
        await execute(
          `UPDATE ${tables.companiesV2} SET last_fy_fetch_at = ? WHERE id = ?`,
          [new Date().toISOString(), item.companyId]
        );
      } else if (item.period === "q" && periodComplete && newestFiscalDateProcessed) {
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
      processed,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
