import { execute } from "../../../../api/_db.js";
import { assertCronSecret } from "../../../../api/_auth.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import macroIngestHandler from "../admin/macro-ingest.js";
import macroRunEngineHandler from "../admin/macro-run-engine.js";
import { computeMacroRegimeHistory } from "../../../lib/macro/history.js";
import { buildMacroLatestReadPayload } from "../sector/global-macro.js";
import { upsertLatestMacroReadCache, upsertMacroHistoryReadCache } from "../../../lib/macro/readCache.js";

const REGIONS = ["US", "EA", "SE"] as const;
const LOCK_TICKER = "__cron_macro_refresh_lock__";
const LOCK_TTL_MS = 90 * 60 * 1000;

function makeMockRes() {
  const out: any = { statusCode: 200, body: null };
  return {
    status(code: number) { out.statusCode = code; return this; },
    json(body: unknown) { out.body = body; return this; },
    _out: out,
  };
}

async function acquireCronLock(runId: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  const thresholdIso = new Date(now.getTime() - LOCK_TTL_MS).toISOString();
  await execute(
    `DELETE FROM ${tables.fetchLog}
     WHERE ticker = ? AND period = 'lock' AND statement = 'macro_refresh' AND run_at < ?`,
    [LOCK_TICKER, thresholdIso],
  );
  const inserted = await execute(
    `INSERT INTO ${tables.fetchLog} (run_at, ticker, period, statement, ok, error)
     SELECT ?, ?, 'lock', 'macro_refresh', 1, ?
     WHERE NOT EXISTS (
      SELECT 1 FROM ${tables.fetchLog}
      WHERE ticker = ? AND period = 'lock' AND statement = 'macro_refresh' AND run_at >= ?
     )`,
    [nowIso, LOCK_TICKER, runId, LOCK_TICKER, thresholdIso],
  );
  return (inserted.rowsAffected ?? 0) > 0;
}

async function releaseCronLock(runId: string) {
  await execute(
    `DELETE FROM ${tables.fetchLog}
     WHERE ticker = ? AND period = 'lock' AND statement = 'macro_refresh' AND error = ?`,
    [LOCK_TICKER, runId],
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    assertCronSecret(req);
  } catch {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  await ensureSchema();
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const lockAcquired = await acquireCronLock(runId);
  if (!lockAcquired) {
    res.status(200).json({ ok: true, skipped: true, reason: "lock_held" });
    return;
  }

  const startedAt = Date.now();
  const perRegion: Array<Record<string, unknown>> = [];

  try {
    for (const region of REGIONS) {
      const regionStart = Date.now();
      const ingestRes = makeMockRes();
      const ingestStart = Date.now();
      await macroIngestHandler({ method: "POST", query: { region, mode: "latest" }, headers: req.headers }, ingestRes);
      const ingestMs = Date.now() - ingestStart;
      if (ingestRes._out.statusCode >= 300 || !Boolean((ingestRes._out.body as any)?.ok)) {
        throw new Error(`macro ingest failed for ${region} (status=${ingestRes._out.statusCode})`);
      }

      const engineRes = makeMockRes();
      const engineStart = Date.now();
      await macroRunEngineHandler({ method: "POST", query: { region }, headers: req.headers }, engineRes);
      const engineMs = Date.now() - engineStart;
      if (engineRes._out.statusCode >= 300 || !Boolean((engineRes._out.body as any)?.ok)) {
        throw new Error(`macro engine failed for ${region} (status=${engineRes._out.statusCode})`);
      }

      const snapshotStart = Date.now();
      const snapshotPayload = await buildMacroLatestReadPayload(region);
      const snapshotAsOf = (snapshotPayload as any)?.globalMacro?.regime?.asOfDate ?? null;
      await upsertLatestMacroReadCache(region, snapshotAsOf, snapshotPayload);
      const snapshotWriteMs = Date.now() - snapshotStart;

      const historyStart = Date.now();
      const monthly20 = await computeMacroRegimeHistory({ region, resolution: "MONTHLY", rangeYears: 20 });
      const weekly3 = await computeMacroRegimeHistory({ region, resolution: "WEEKLY", rangeYears: 3 });
      await upsertMacroHistoryReadCache({ region, resolution: "MONTHLY", rangeYears: 20, payload: monthly20 });
      await upsertMacroHistoryReadCache({ region, resolution: "WEEKLY", rangeYears: 3, payload: weekly3 });
      const historyWriteMs = Date.now() - historyStart;

      perRegion.push({
        region,
        ingestStatus: ingestRes._out.statusCode,
        ingestOk: Boolean((ingestRes._out.body as any)?.ok),
        ingestMs,
        engineStatus: engineRes._out.statusCode,
        engineOk: Boolean((engineRes._out.body as any)?.ok),
        engineMs,
        snapshotAsOf,
        snapshotWriteMs,
        historyWriteMs,
        historyPointsMonthly20: monthly20.points.length,
        historyPointsWeekly3: weekly3.points.length,
        totalRegionMs: Date.now() - regionStart,
      });
    }

    const globalStart = Date.now();
    const globalPayload = await buildMacroLatestReadPayload("GLOBAL");
    const globalAsOf = (globalPayload as any)?.globalMacro?.regime?.asOfDate ?? null;
    await upsertLatestMacroReadCache("GLOBAL", globalAsOf, globalPayload);
    const globalMonthly = await computeMacroRegimeHistory({ region: "GLOBAL", resolution: "MONTHLY", rangeYears: 20 });
    const globalWeekly = await computeMacroRegimeHistory({ region: "GLOBAL", resolution: "WEEKLY", rangeYears: 3 });
    await upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "MONTHLY", rangeYears: 20, payload: globalMonthly });
    await upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "WEEKLY", rangeYears: 3, payload: globalWeekly });
    const globalMs = Date.now() - globalStart;

    const summary = {
      ok: true,
      runId,
      durationMs: Date.now() - startedAt,
      perRegion,
      global: { asOfDate: globalAsOf, durationMs: globalMs, monthlyPoints: globalMonthly.points.length, weeklyPoints: globalWeekly.points.length },
    };
    console.info("[macro-refresh-cron]", summary);
    res.status(200).json(summary);
  } catch (error) {
    console.error("[macro-refresh-cron]", { runId, error: (error as Error).message });
    res.status(500).json({ ok: false, runId, error: (error as Error).message });
  } finally {
    await releaseCronLock(runId);
  }
}
