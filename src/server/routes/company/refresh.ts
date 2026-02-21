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
const PERIODS: PeriodType[] = ["fy", "q"];
const BOOTSTRAP_REPORT_LIMIT = 12;
const MAX_POINTS_PER_RUN = 10000;
const REPORT_BATCH_SIZE = 30;

function targetKey(statement: StatementType, period: PeriodType) {
  return `${statement}:${period}`;
}

function computeProcessedTotalFromCursor(params: {
  targets: Array<{ statement: StatementType; period: PeriodType }>;
  cursor: { statement: StatementType; period: PeriodType; offset: number } | null;
}) {
  if (!params.cursor) {
    return 0;
  }

  const cursorIndex = params.targets.findIndex(
    (target) => target.statement === params.cursor?.statement && target.period === params.cursor?.period
  );
  if (cursorIndex < 0) {
    return 0;
  }

  return params.targets.reduce((acc, _target, index) => {
    if (index < cursorIndex) {
      return acc + 1;
    }
    return acc;
  }, 0);
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

async function hasAnyReports(companyId: number, period: PeriodType, statement: StatementType) {
  const rows = await query(
    `SELECT 1
     FROM ${tables.financialReports}
     WHERE company_id = ? AND period = ? AND statement = ?
     LIMIT 1`,
    [companyId, period, statement]
  );
  return rows.length > 0;
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
    const cutoffDate = toFiscalDateCutoffIso();
    console.info("[company-refresh]", { stage: "materialization_cutoff", ticker, cutoffDate });

    if (!skipFetch) {
      for (const period of PERIODS) {
        for (const statement of STATEMENTS) {
          try {
            const reportExists = await hasAnyReports(companyId, period, statement);
            const rows = await fetchStatement(ticker, statement, period, {
              limit: reportExists ? undefined : BOOTSTRAP_REPORT_LIMIT,
            });
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
    let rowsWrittenInRun = 0;
    let rowsWrittenInRunAttempted = 0;
    let nextCursor: { statement: StatementType; period: PeriodType; offset: number } | null = null;
    let responseCursor: { statement: StatementType; period: PeriodType; offset: number } | null = null;
    let done = true;
    let currentTargetProgress: {
      statement: StatementType;
      period: PeriodType;
      currentOffset: number;
      nextOffset: number;
      totalReports: number;
      remainingReports: number;
    } | null = null;
    const periodStatus: Record<PeriodType, { seen: boolean; complete: boolean; newestProcessed: boolean }> = {
      fy: { seen: false, complete: true, newestProcessed: true },
      q: { seen: false, complete: true, newestProcessed: true },
    };

    const targets: Array<{ statement: StatementType; period: PeriodType }> = [];
    for (const period of PERIODS) {
      for (const statement of STATEMENTS) {
        targets.push({ statement, period });
      }
    }

    const targetCounts = new Map<string, number>();
    for (const target of targets) {
      const countRows = await query(
        `SELECT COUNT(*) as n
         FROM ${tables.financialReports}
         WHERE company_id = ? AND statement = ? AND period = ? AND fiscal_date >= ?`,
        [companyId, target.statement, target.period, cutoffDate]
      );
      targetCounts.set(targetKey(target.statement, target.period), Number(countRows[0]?.n ?? 0));
    }

    for (const target of targets) {
      const offset =
        cursor && cursor.statement === target.statement && cursor.period === target.period
          ? cursor.offset
          : 0;
      const totalReports = targetCounts.get(targetKey(target.statement, target.period)) ?? 0;

      const { reportsDatesCount, pointsDatesCount } = await getCoverageCounts({
        companyId,
        statement: target.statement,
        period: target.period,
        cutoffDate,
      });
      console.info("[company-refresh]", {
        stage: "materialization_target_preflight",
        statement: target.statement,
        period: target.period,
        reportsDatesCount,
        pointsDatesCount,
        cutoffDate,
      });

      if (reportsDatesCount === 0 || pointsDatesCount >= reportsDatesCount) {
        currentTargetProgress = {
          statement: target.statement,
          period: target.period,
          currentOffset: 0,
          nextOffset: 0,
          totalReports,
          remainingReports: 0,
        };
        periodStatus[target.period].seen = true;
        console.info("[company-refresh]", {
          stage: "materialization_target_skipped",
          statement: target.statement,
          period: target.period,
          reportsDatesCount,
          pointsDatesCount,
          reason: reportsDatesCount === 0 ? "no_reports" : "date_coverage_reached",
        });
        continue;
      }

      const {
        inserted,
        rowsWritten,
        rowsAttempted,
        sourceRowsLen,
        nextOffset,
        done: targetDone,
        newestFiscalDateProcessed,
      } = await materializeReports({
        companyId,
        statement: target.statement,
        period: target.period,
        offset,
        limit: REPORT_BATCH_SIZE,
        maxPoints: MAX_POINTS_PER_RUN - materialized,
        cutoffDate,
      });

      let resolvedNextOffset = nextOffset;
      let resolvedTargetDone = targetDone;
      if (!resolvedTargetDone && resolvedNextOffset <= offset) {
        console.info("[company-refresh]", {
          stage: "materialization_no_progress_risk",
          statement: target.statement,
          period: target.period,
          localOffsetCurrent: offset,
          computedNext: resolvedNextOffset,
          sourceRowsLen,
          rowsAttempted,
          rowsWritten,
        });
        if (sourceRowsLen === 0) {
          resolvedTargetDone = true;
        } else {
          resolvedNextOffset = offset + sourceRowsLen;
        }
      }

      currentTargetProgress = {
        statement: target.statement,
        period: target.period,
        currentOffset: offset,
        nextOffset: resolvedNextOffset,
        totalReports,
        remainingReports: Math.max(0, totalReports - resolvedNextOffset),
      };
      periodStatus[target.period].seen = true;
      periodStatus[target.period].newestProcessed =
        periodStatus[target.period].newestProcessed &&
        (offset > 0 || newestFiscalDateProcessed);
      materialized += inserted;
      rowsWrittenInRun += rowsWritten;
      rowsWrittenInRunAttempted += rowsAttempted;
      if (!resolvedTargetDone) {
        periodStatus[target.period].complete = false;
        periodStatus[target.period].newestProcessed = false;
        done = false;
        responseCursor = { statement: target.statement, period: target.period, offset };
        nextCursor = { statement: target.statement, period: target.period, offset: resolvedNextOffset };
        break;
      }
      if (materialized >= MAX_POINTS_PER_RUN || Date.now() - startTime > 45000) {
        periodStatus[target.period].complete = false;
        done = false;
        responseCursor = { statement: target.statement, period: target.period, offset };
        nextCursor = { statement: target.statement, period: target.period, offset: resolvedNextOffset };
        break;
      }
    }

    const now = new Date().toISOString();
    if (periodStatus.fy.seen && periodStatus.fy.complete && periodStatus.fy.newestProcessed) {
      await execute(
        `UPDATE ${tables.companiesV2}
         SET last_fy_fetch_at = ?
         WHERE id = ?`,
        [now, companyId]
      );
    }
    if (periodStatus.q.seen && periodStatus.q.complete && periodStatus.q.newestProcessed) {
      await execute(
        `UPDATE ${tables.companiesV2}
         SET last_q_fetch_at = ?
         WHERE id = ?`,
        [now, companyId]
      );
    }

    const activeTargets = targets.filter(
      (target) => (targetCounts.get(targetKey(target.statement, target.period)) ?? 0) > 0
    );
    const totalToProcess = activeTargets.length;
    const previousProcessedTotal = computeProcessedTotalFromCursor({
      targets: activeTargets,
      cursor,
    });
    const targetIndexGlobal = done
      ? totalToProcess
      : computeProcessedTotalFromCursor({ targets: activeTargets, cursor: nextCursor });
    const targetsProcessedInRun = Math.max(0, targetIndexGlobal - previousProcessedTotal);
    const remainingTargets = Math.max(0, totalToProcess - targetIndexGlobal);
    const localOffsetCurrent = responseCursor?.offset ?? (cursor?.offset ?? 0);
    const localOffsetNext = nextCursor?.offset ?? (done ? null : localOffsetCurrent);
    console.info("[company-refresh]", {
      stage: "materialization_payload_consistency",
      rowsAttempted: rowsWrittenInRunAttempted,
      rowsWritten: rowsWrittenInRun,
      insertedLegacy: rowsWrittenInRun,
    });

    res.status(200).json({
      ok: true,
      ticker,
      phase: done ? "materialized_done" : "materialized_partial",
      raw: rawSummary,
      materialization: {
        cursor: responseCursor,
        nextCursor,
        done,
        inserted: rowsWrittenInRun,
        processedInRun: rowsWrittenInRun,
        progressUnit: "targets",
        targetsTotal: totalToProcess,
        targetIndexGlobal,
        targetsProcessedTotal: targetIndexGlobal,
        targetsProcessedInRun,
        rowsWrittenInRun,
        rowsWrittenInRunAttempted,
        processedTotal: targetIndexGlobal,
        statement: currentTargetProgress?.statement ?? null,
        period: currentTargetProgress?.period ?? null,
        localOffsetCurrent,
        localOffsetNext,
        currentOffset: localOffsetCurrent,
        nextOffset: localOffsetNext,
        totalToProcess: totalToProcess,
        remainingTargets,
        remaining: remainingTargets,
      },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    const requestCursor = (req.body?.cursor ?? null) as
      | { statement: StatementType; period: PeriodType; offset: number }
      | null;
    res.status(status).json({
      ok: false,
      error: (error as Error).message,
      materialization: {
        cursor: requestCursor,
        nextCursor: requestCursor,
        done: false,
        inserted: 0,
        processedInRun: 0,
        progressUnit: "targets",
        targetsTotal: 0,
        targetIndexGlobal: 0,
        targetsProcessedTotal: 0,
        targetsProcessedInRun: 0,
        rowsWrittenInRun: 0,
        rowsWrittenInRunAttempted: 0,
        processedTotal: 0,
        statement: requestCursor?.statement ?? null,
        period: requestCursor?.period ?? null,
        localOffsetCurrent: requestCursor?.offset ?? 0,
        localOffsetNext: requestCursor?.offset ?? null,
        currentOffset: requestCursor?.offset ?? 0,
        nextOffset: requestCursor?.offset ?? null,
        totalToProcess: 0,
        remainingTargets: 0,
        remaining: 0,
      },
    });
  }
}
