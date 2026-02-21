import { assertCronSecret } from "../../../../api/_auth.js";
import { batch, execute, getDb, query } from "../../../../api/_db.js";
import {
  fetchStatement,
  normalizeFinancialPoints,
  PeriodType,
  StatementType,
  requireFmpApiKey,
} from "../../../../api/_fmp.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";

const STATEMENTS: StatementType[] = ["balance", "income", "cashflow"];
const PERIODS: PeriodType[] = ["fy", "q"];
const MAX_POINTS_PER_RUN = 10000;
const REPORT_BATCH_SIZE = 30;

function targetKey(statement: StatementType, period: PeriodType) {
  return `${statement}:${period}`;
}

function computeProcessedTotalFromCursor(params: {
  targets: Array<{ statement: StatementType; period: PeriodType }>;
  targetCounts: Map<string, number>;
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

  return params.targets.reduce((acc, target, index) => {
    const count = params.targetCounts.get(targetKey(target.statement, target.period)) ?? 0;
    if (index < cursorIndex) {
      return acc + count;
    }
    if (index === cursorIndex) {
      return acc + Math.max(0, Math.min(params.cursor?.offset ?? 0, count));
    }
    return acc;
  }, 0);
}

function toFiscalDateCutoffIso() {
  const now = new Date();
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 20);
  return cutoff.toISOString().slice(0, 10);
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

async function materializeReports(params: {
  companyId: number;
  statement: StatementType;
  period: PeriodType;
  offset: number;
  limit: number;
  maxPoints: number;
  cutoffDate: string;
}) {
  const latestRows = await query(
    `SELECT fiscal_date
     FROM ${tables.financialReports}
     WHERE company_id = ? AND statement = ? AND period = ? AND fiscal_date >= ?
     ORDER BY fiscal_date DESC
     LIMIT 1`,
    [params.companyId, params.statement, params.period, params.cutoffDate]
  );
  const latestFiscalDate = String(latestRows[0]?.fiscal_date ?? "");

  const rows = await query(
    `SELECT fiscal_date, data_json, fetched_at
     FROM ${tables.financialReports}
     WHERE company_id = ? AND statement = ? AND period = ? AND fiscal_date >= ?
     ORDER BY fiscal_date DESC
     LIMIT ? OFFSET ?`,
    [params.companyId, params.statement, params.period, params.cutoffDate, params.limit, params.offset]
  );

  let inserted = 0;
  let rowsAttempted = 0;
  let rowsWritten = 0;
  let chunksWritten = 0;
  let rowsExistingFetched = 0;
  let rowsUnchangedSkipped = 0;
  let newestFiscalDateProcessed = false;
  const runStartedAt = Date.now();
  let deltaReadMs = 0;
  let writeMs = 0;
  let transformMs = 0;

  const bufferedPoints: Array<{ fiscalDate: string; field: string; value: number; fetchedAt: string }> = [];

  const db = getDb();
  let tx: Awaited<ReturnType<typeof db.transaction>> | null = null;

  async function flushBufferedPoints() {
    if (bufferedPoints.length === 0) {
      return;
    }

    rowsAttempted += bufferedPoints.length;

    const fiscalDates = Array.from(new Set(bufferedPoints.map((point) => point.fiscalDate)));
    const fields = Array.from(new Set(bufferedPoints.map((point) => point.field)));
    const existingValueMap = new Map<string, number | null>();

    if (fiscalDates.length > 0 && fields.length > 0) {
      const deltaReadStartedAt = Date.now();
      const fiscalDatePlaceholders = fiscalDates.map(() => "?").join(",");
      const fieldPlaceholders = fields.map(() => "?").join(",");
      const existingResult = await tx!.execute({
        sql: `SELECT fiscal_date, field, value
              FROM ${tables.financialPoints}
              WHERE company_id = ? AND statement = ? AND period = ?
                AND fiscal_date IN (${fiscalDatePlaceholders})
                AND field IN (${fieldPlaceholders})`,
        args: [
          params.companyId,
          params.statement,
          params.period,
          ...fiscalDates,
          ...fields,
        ],
      });
      const existingRows = existingResult.rows;
      rowsExistingFetched += existingRows.length;
      deltaReadMs += Date.now() - deltaReadStartedAt;

      for (const row of existingRows) {
        const key = `${String(row.fiscal_date)}|${String(row.field)}`;
        const value = row.value == null ? null : Number(row.value);
        existingValueMap.set(key, Number.isFinite(value as number) ? (value as number) : null);
      }
    }

    const changedRows = bufferedPoints.filter((point) => {
      const key = `${point.fiscalDate}|${point.field}`;
      const existing = existingValueMap.get(key);
      return existing == null || existing !== point.value;
    });
    rowsUnchangedSkipped += bufferedPoints.length - changedRows.length;

    if (changedRows.length === 0) {
      bufferedPoints.length = 0;
      return;
    }

    const SQL_CHUNK_ROWS = 120;
    for (let i = 0; i < changedRows.length; i += SQL_CHUNK_ROWS) {
      const chunkWriteStartedAt = Date.now();
      const chunk = changedRows.slice(i, i + SQL_CHUNK_ROWS);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(",");
      const args: Array<string | number> = [];
      for (const row of chunk) {
        args.push(
          params.companyId,
          params.statement,
          params.period,
          row.fiscalDate,
          row.field,
          row.value,
          row.fetchedAt,
        );
      }

      await tx!.execute({
        sql: `INSERT INTO ${tables.financialPoints}
              (company_id, statement, period, fiscal_date, field, value, fetched_at)
              VALUES ${placeholders}
              ON CONFLICT(company_id, statement, period, fiscal_date, field)
              DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`,
        args,
      });
      writeMs += Date.now() - chunkWriteStartedAt;
      rowsWritten += chunk.length;
      chunksWritten += 1;
      console.info("[company-refresh]", {
        stage: "materialization_chunk_write",
        statement: params.statement,
        period: params.period,
        chunkIndex: chunksWritten,
        valuesCount: chunk.length,
        txStage,
        elapsedMs: Date.now() - runStartedAt,
      });
    }

    bufferedPoints.length = 0;
  }

  let txActive = false;
  let txStage: "begin" | "write" | "commit" = "begin";
  try {
    tx = await db.transaction("write");
    txActive = true;
    txStage = "write";

    for (const row of rows) {
      const report = JSON.parse(String(row.data_json ?? "{}")) as Record<string, unknown>;
      const fiscalDate = String(row.fiscal_date ?? "");
      const fetchedAt = String(row.fetched_at ?? new Date().toISOString());
      if (!fiscalDate) {
        continue;
      }
      if (latestFiscalDate && fiscalDate === latestFiscalDate) {
        newestFiscalDateProcessed = true;
      }

      const transformStartedAt = Date.now();
      const points = normalizeFinancialPoints(
        String(params.companyId),
        params.statement,
        params.period,
        [report]
      );
      transformMs += Date.now() - transformStartedAt;

      for (const point of points) {
        bufferedPoints.push({
          fiscalDate,
          field: point.field,
          value: point.value,
          fetchedAt,
        });
        inserted += 1;
        if (bufferedPoints.length >= 800) {
          await flushBufferedPoints();
        }
        if (inserted >= params.maxPoints) {
          break;
        }
      }
      if (inserted >= params.maxPoints) {
        break;
      }
    }

    await flushBufferedPoints();
    txStage = "commit";
    await tx.commit();
    txActive = false;
    tx = null;
  } catch (error) {
    console.info("[company-refresh]", {
      stage: "materialization_tx_error",
      txActive,
      txStage,
      message: (error as Error).message,
    });
    if (txActive && tx) {
      try {
        await tx.rollback();
      } catch (rollbackError) {
        const rollbackMessage = (rollbackError as Error).message.toLowerCase();
        if (!rollbackMessage.includes("no transaction is active")) {
          throw rollbackError;
        }
      }
      txActive = false;
      tx = null;
    }
    throw error;
  }

  console.info("[company-refresh]", {
    stage: "materialization_write_stats",
    companyId: params.companyId,
    statement: params.statement,
    period: params.period,
    offset: params.offset,
    rowsAttempted,
    rowsExistingFetched,
    rowsUnchangedSkipped,
    rowsWritten,
    chunksWritten,
    phaseMs: {
      transformMs,
      deltaReadMs,
      writeMs,
      otherMs: Math.max(0, Date.now() - runStartedAt - transformMs - deltaReadMs - writeMs),
    },
    elapsedMs: Date.now() - runStartedAt,
  });

  const nextOffset = params.offset + rows.length;
  const done = rows.length < params.limit && inserted < params.maxPoints;
  return {
    inserted,
    rowsAttempted,
    rowsWritten,
    nextOffset,
    done,
    newestFiscalDateProcessed,
  };
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
    let rowsWrittenInRun = 0;
    let rowsWrittenInRunAttempted = 0;
    let nextCursor: { statement: StatementType; period: PeriodType; offset: number } | null = null;
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
      const { inserted, rowsWritten, rowsAttempted, nextOffset, done: targetDone, newestFiscalDateProcessed } = await materializeReports({
        companyId,
        statement: target.statement,
        period: target.period,
        offset,
        limit: REPORT_BATCH_SIZE,
        maxPoints: MAX_POINTS_PER_RUN - materialized,
        cutoffDate,
      });
      currentTargetProgress = {
        statement: target.statement,
        period: target.period,
        currentOffset: offset,
        nextOffset,
        totalReports,
        remainingReports: Math.max(0, totalReports - nextOffset),
      };
      periodStatus[target.period].seen = true;
      periodStatus[target.period].newestProcessed =
        periodStatus[target.period].newestProcessed &&
        (offset > 0 || newestFiscalDateProcessed);
      materialized += inserted;
      rowsWrittenInRun += rowsWritten;
      rowsWrittenInRunAttempted += rowsAttempted;
      if (!targetDone) {
        periodStatus[target.period].complete = false;
        periodStatus[target.period].newestProcessed = false;
        done = false;
        nextCursor = { statement: target.statement, period: target.period, offset: nextOffset };
        break;
      }
      if (materialized >= MAX_POINTS_PER_RUN || Date.now() - startTime > 45000) {
        periodStatus[target.period].complete = false;
        done = false;
        nextCursor = { statement: target.statement, period: target.period, offset: nextOffset };
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

    const totalToProcess = targets.reduce(
      (acc, target) => acc + (targetCounts.get(targetKey(target.statement, target.period)) ?? 0),
      0
    );
    const previousProcessedTotal = computeProcessedTotalFromCursor({
      targets,
      targetCounts,
      cursor,
    });
    const processedTotal = done
      ? totalToProcess
      : computeProcessedTotalFromCursor({ targets, targetCounts, cursor: nextCursor });
    const targetsProcessedInRun = Math.max(0, processedTotal - previousProcessedTotal);
    const remainingTargets = Math.max(0, totalToProcess - processedTotal);
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
        cursor: nextCursor,
        done,
        inserted: rowsWrittenInRun,
        processedInRun: rowsWrittenInRun,
        progressUnit: "targets",
        targetsTotal: totalToProcess,
        targetsProcessedTotal: processedTotal,
        targetsProcessedInRun,
        rowsWrittenInRun,
        rowsWrittenInRunAttempted,
        processedTotal,
        statement: currentTargetProgress?.statement ?? null,
        period: currentTargetProgress?.period ?? null,
        currentOffset: previousProcessedTotal,
        nextOffset: done ? totalToProcess : processedTotal,
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
        done: false,
        inserted: 0,
        processedInRun: 0,
        progressUnit: "targets",
        targetsTotal: 0,
        targetsProcessedTotal: requestCursor?.offset ?? 0,
        targetsProcessedInRun: 0,
        rowsWrittenInRun: 0,
        rowsWrittenInRunAttempted: 0,
        processedTotal: requestCursor?.offset ?? 0,
        statement: requestCursor?.statement ?? null,
        period: requestCursor?.period ?? null,
        currentOffset: requestCursor?.offset ?? 0,
        nextOffset: requestCursor?.offset ?? null,
        totalToProcess: 0,
        remainingTargets: 0,
        remaining: 0,
      },
    });
  }
}
