import { getDb, query } from "../../../api/_db.js";
import { normalizeFinancialPoints, PeriodType, StatementType } from "../../../api/_fmp.js";
import { tables } from "../../../api/_migrate.js";

export function toFiscalDateCutoffIso() {
  const now = new Date();
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 20);
  return cutoff.toISOString().slice(0, 10);
}

export async function getCoverageCounts(params: {
  companyId: number;
  period: PeriodType;
  statement: StatementType;
  cutoffDate: string;
}) {
  const reportCountRows = await query(
    `SELECT COUNT(DISTINCT fiscal_date) as n
     FROM ${tables.financialReports}
     WHERE company_id = ? AND period = ? AND statement = ? AND fiscal_date >= ?`,
    [params.companyId, params.period, params.statement, params.cutoffDate]
  );
  const pointCountRows = await query(
    `SELECT COUNT(DISTINCT fiscal_date) as n
     FROM ${tables.financialPoints}
     WHERE company_id = ? AND period = ? AND statement = ? AND fiscal_date >= ?`,
    [params.companyId, params.period, params.statement, params.cutoffDate]
  );

  return {
    reportsDatesCount: Number(reportCountRows[0]?.n ?? 0),
    pointsDatesCount: Number(pointCountRows[0]?.n ?? 0),
  };
}

export async function materializeReports(params: {
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

  const sourceRowsLen = rows.length;
  const nextOffset = params.offset + sourceRowsLen;
  const done = sourceRowsLen === 0 || (sourceRowsLen < params.limit && inserted < params.maxPoints);
  return {
    inserted,
    rowsAttempted,
    rowsWritten,
    sourceRowsLen,
    nextOffset,
    done,
    newestFiscalDateProcessed,
  };
}
