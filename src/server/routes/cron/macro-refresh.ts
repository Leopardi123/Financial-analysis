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

function internalAdminHeaders(reqHeaders: Record<string, string | string[] | undefined>) {
  const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET || "";
  const auth = reqHeaders.authorization;
  const authorization = Array.isArray(auth) ? auth[0] : auth;
  const cronHeaderRaw = reqHeaders["x-cron-secret"];
  const cronHeader = Array.isArray(cronHeaderRaw) ? cronHeaderRaw[0] : cronHeaderRaw;

  return {
    ...reqHeaders,
    ...(adminSecret
      ? {
        "x-admin-secret": adminSecret,
        authorization: authorization ?? `Bearer ${adminSecret}`,
      }
      : {}),
    ...(cronHeader ? { "x-cron-secret": cronHeader } : {}),
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
  const quickMode = String(req.query?.quick ?? "0") === "1";
  const requestedRegionRaw = String(req.query?.region ?? "ALL").toUpperCase();
  const requestedRegion = requestedRegionRaw === "GLOBAL" ? "ALL" : requestedRegionRaw;
  const regionsToRun = (requestedRegion === "ALL" ? [...REGIONS] : REGIONS.filter((r) => r === requestedRegion)) as Array<(typeof REGIONS)[number]>;
  const perRegion: Array<Record<string, unknown>> = [];
  const forwardedHeaders = internalAdminHeaders(req.headers ?? {});

  try {
    console.info("[macro-refresh-cron]", {
      runId,
      endpoint: "/api/cron/macro-refresh",
      authContext: {
        cronSecretPresent: Boolean(process.env.CRON_SECRET),
        adminSecretPresent: Boolean(process.env.ADMIN_SECRET),
        fredApiKeyPresent: Boolean(process.env.FRED_API_KEY),
      },
    });

    for (const region of regionsToRun) {
      const regionStart = Date.now();
      const regionSummary: Record<string, unknown> = {
        region,
        ingestEndpoint: "/api/admin/macro/ingest",
        engineEndpoint: "/api/admin/macro/run-engine",
        ingestOk: false,
        engineOk: false,
        snapshotCacheWritten: false,
        historyCacheWritten: false,
      };

      try {
        const ingestRes = makeMockRes();
        const ingestStart = Date.now();
        await macroIngestHandler({ method: "POST", query: { region, mode: "latest" }, headers: forwardedHeaders }, ingestRes);
        const ingestMs = Date.now() - ingestStart;
        const ingestOk = ingestRes._out.statusCode < 300 && Boolean((ingestRes._out.body as any)?.ok);
        Object.assign(regionSummary, {
          ingestStatus: ingestRes._out.statusCode,
          ingestOk,
          ingestMs,
          ingestFallingStep: (ingestRes._out.body as any)?.debug?.failingStep ?? null,
          ingestError: (ingestRes._out.body as any)?.error ?? null,
        });

        if (!ingestOk) {
          Object.assign(regionSummary, {
            error: `macro ingest failed for ${region} (status=${ingestRes._out.statusCode})`,
            totalRegionMs: Date.now() - regionStart,
          });
          perRegion.push(regionSummary);
          continue;
        }

        const engineRes = makeMockRes();
        const engineStart = Date.now();
        await macroRunEngineHandler({ method: "POST", query: { region }, headers: forwardedHeaders }, engineRes);
        const engineMs = Date.now() - engineStart;
        const engineOk = engineRes._out.statusCode < 300 && Boolean((engineRes._out.body as any)?.ok);
        Object.assign(regionSummary, {
          engineStatus: engineRes._out.statusCode,
          engineOk,
          engineMs,
          engineError: (engineRes._out.body as any)?.error ?? null,
        });

        if (!engineOk) {
          Object.assign(regionSummary, {
            error: `macro engine failed for ${region} (status=${engineRes._out.statusCode})`,
            totalRegionMs: Date.now() - regionStart,
          });
          perRegion.push(regionSummary);
          continue;
        }

        const snapshotStart = Date.now();
        const snapshotPayload = await buildMacroLatestReadPayload(region);
        const snapshotAsOf = (snapshotPayload as any)?.globalMacro?.regime?.asOfDate ?? null;
        await upsertLatestMacroReadCache(region, snapshotAsOf, snapshotPayload);
        const snapshotWriteMs = Date.now() - snapshotStart;

        let historyWriteMs = 0;
        let historyPointsMonthly20: number | null = null;
        let historyPointsWeekly3: number | null = null;
        if (!quickMode) {
          const historyStart = Date.now();
          const monthly20 = await computeMacroRegimeHistory({ region, resolution: "MONTHLY", rangeYears: 20 });
          const weekly3 = await computeMacroRegimeHistory({ region, resolution: "WEEKLY", rangeYears: 3 });
          await upsertMacroHistoryReadCache({ region, resolution: "MONTHLY", rangeYears: 20, payload: monthly20 });
          await upsertMacroHistoryReadCache({ region, resolution: "WEEKLY", rangeYears: 3, payload: weekly3 });
          historyWriteMs = Date.now() - historyStart;
          historyPointsMonthly20 = monthly20.points.length;
          historyPointsWeekly3 = weekly3.points.length;
        }

        Object.assign(regionSummary, {
          snapshotAsOf,
          snapshotCacheWritten: true,
          historyCacheWritten: quickMode ? "skipped_quick_mode" : true,
          snapshotWriteMs,
          historyWriteMs,
          historyPointsMonthly20,
          historyPointsWeekly3,
          totalRegionMs: Date.now() - regionStart,
        });
        perRegion.push(regionSummary);
      } catch (error) {
        Object.assign(regionSummary, {
          error: (error as Error).message,
          totalRegionMs: Date.now() - regionStart,
        });
        perRegion.push(regionSummary);
      }
    }

    let global: Record<string, unknown> = { attempted: false };
    try {
      const globalStart = Date.now();
      const globalPayload = await buildMacroLatestReadPayload("GLOBAL");
      const globalAsOf = (globalPayload as any)?.globalMacro?.regime?.asOfDate ?? null;
      await upsertLatestMacroReadCache("GLOBAL", globalAsOf, globalPayload);
      if (!quickMode) {
        const globalMonthly = await computeMacroRegimeHistory({ region: "GLOBAL", resolution: "MONTHLY", rangeYears: 20 });
        const globalWeekly = await computeMacroRegimeHistory({ region: "GLOBAL", resolution: "WEEKLY", rangeYears: 3 });
        await upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "MONTHLY", rangeYears: 20, payload: globalMonthly });
        await upsertMacroHistoryReadCache({ region: "GLOBAL", resolution: "WEEKLY", rangeYears: 3, payload: globalWeekly });
        global = {
          attempted: true,
          ok: true,
          asOfDate: globalAsOf,
          durationMs: Date.now() - globalStart,
          monthlyPoints: globalMonthly.points.length,
          weeklyPoints: globalWeekly.points.length,
          mode: "full",
        };
      } else {
        global = { attempted: true, ok: true, asOfDate: globalAsOf, durationMs: Date.now() - globalStart, mode: "quick" };
      }
    } catch (error) {
      global = { attempted: true, ok: false, error: (error as Error).message };
    }

    const successRegions = perRegion.filter((row) => row.snapshotCacheWritten === true).length;
    const summary = {
      ok: successRegions > 0,
      runId,
      mode: quickMode ? "quick" : "full",
      requestedRegion,
      regionsAttempted: regionsToRun,
      durationMs: Date.now() - startedAt,
      successRegions,
      failedRegions: perRegion.length - successRegions,
      perRegion,
      global,
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
