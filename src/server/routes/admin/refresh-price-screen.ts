import { assertCronSecret } from "../../../../api/_auth.js";
import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { requireFmpApiKey } from "../../../../api/_fmp.js";
import { ingestManySymbols } from "../../../lib/prices/screening/ingest.js";

export default async function handler(req: any, res: any) {
  try {
    assertCronSecret(req);
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    await ensureSchema();

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const debug = String(req.query?.debug ?? body.debug ?? "") === "1" || body.debug === true;

    const explicitSymbols = Array.isArray(body.symbols)
      ? body.symbols.map((item: unknown) => String(item).trim().toUpperCase()).filter(Boolean)
      : [];
    const rawOffset = Number(req.query?.offset ?? body.offset ?? 0);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
    const rawBatchSize = Number(req.query?.batchSize ?? body.batchSize ?? 10);
    const batchSize = Math.max(1, Math.min(10, Number.isFinite(rawBatchSize) ? Math.floor(rawBatchSize) : 10));

    let symbols = explicitSymbols;
    if (symbols.length === 0) {
      const rows = await query(
        `SELECT ticker
         FROM ${tables.companiesV2}
         WHERE active = 1
         ORDER BY ticker`,
      ) as unknown as Array<{ ticker: string }>;
      symbols = rows.map((row) => String(row.ticker).trim().toUpperCase()).filter(Boolean);
    }

    if (symbols.length === 0) {
      res.status(200).json({
        ok: true,
        total: 0,
        succeeded: 0,
        failed: 0,
        changedSymbols: 0,
        writtenDailyRows: 0,
        snapshotWrites: 0,
        results: [],
        failures: [],
        cursor: { offset, nextOffset: null, done: true, processedInRun: 0, totalToProcess: 0, remaining: 0, batchSize },
      });
      return;
    }

    const totalToProcess = symbols.length;
    const runSymbols = symbols.slice(offset, offset + batchSize);
    if (runSymbols.length === 0) {
      res.status(200).json({
        ok: true,
        total: totalToProcess,
        succeeded: 0,
        failed: 0,
        changedSymbols: 0,
        writtenDailyRows: 0,
        snapshotWrites: 0,
        results: [],
        failures: [],
        cursor: {
          offset,
          nextOffset: null,
          done: true,
          processedInRun: 0,
          totalToProcess,
          remaining: 0,
          batchSize,
        },
      });
      return;
    }

    const result = await ingestManySymbols({ symbols: runSymbols, debug });
    const processedInRun = runSymbols.length;
    const processedTotal = Math.min(totalToProcess, offset + processedInRun);
    const remaining = Math.max(0, totalToProcess - processedTotal);
    const done = remaining === 0;
    const nextOffset = done ? null : processedTotal;

    res.status(result.ok ? 200 : 207).json({
      ...result,
      total: totalToProcess,
      cursor: {
        offset,
        nextOffset,
        done,
        processedInRun,
        totalToProcess,
        remaining,
        batchSize,
      },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
