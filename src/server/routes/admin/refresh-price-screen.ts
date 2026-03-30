import { getAdminSecret } from "../../../../api/_auth.js";
import { query } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { requireFmpApiKey } from "../../../../api/_fmp.js";
import { ingestManySymbols } from "../../../lib/prices/screening/ingest.js";

export default async function handler(req: any, res: any) {
  try {
    const startedAt = Date.now();
    const requestStartIso = new Date(startedAt).toISOString();
    // UI mapping note: these steps intentionally mirror the screening ingest chain shown in Admin debug checklist.
    const debugSteps: Array<{
      key: string;
      label: string;
      status: "pending" | "running" | "success" | "skipped" | "failed";
      startedAt?: string;
      endedAt?: string;
      durationMs?: number;
      details?: Record<string, unknown>;
      error?: { message: string };
    }> = [
      { key: "resolve_targets", label: "Resolve targets", status: "pending" },
      { key: "load_symbols_batch", label: "Load symbols / batch", status: "pending" },
      { key: "fetch_price_data", label: "Fetch price data", status: "pending" },
      { key: "normalize_parse_response", label: "Normalize / parse response", status: "pending" },
      { key: "validate_required_fields", label: "Validate required fields", status: "pending" },
      { key: "transform_daily_rows", label: "Transform to daily_price_history rows", status: "pending" },
      { key: "write_daily_history", label: "Write daily_price_history", status: "pending" },
      { key: "load_recent_window", label: "Load recent history window", status: "pending" },
      { key: "compute_snapshot", label: "Compute price_screen_snapshot", status: "pending" },
      { key: "write_snapshot", label: "Write price_screen_snapshot", status: "pending" },
      { key: "finalize_response", label: "Finalize progress / cursor / response", status: "pending" },
    ];
    let lastCompletedStep: string | null = null;
    const markRunning = (key: string, details?: Record<string, unknown>) => {
      const step = debugSteps.find((item) => item.key === key);
      if (!step) return;
      step.status = "running";
      step.startedAt = new Date().toISOString();
      if (details) step.details = { ...(step.details ?? {}), ...details };
    };
    const markDone = (key: string, status: "success" | "skipped" | "failed", details?: Record<string, unknown>, error?: string) => {
      const step = debugSteps.find((item) => item.key === key);
      if (!step) return;
      step.status = status;
      step.endedAt = new Date().toISOString();
      if (step.startedAt) {
        step.durationMs = new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime();
      }
      if (details) step.details = { ...(step.details ?? {}), ...details };
      if (error) step.error = { message: error };
      if (status === "success" || status === "skipped") {
        lastCompletedStep = key;
      }
    };

    const expectedSecret = getAdminSecret();
    const headerCronRaw = req.headers?.["x-cron-secret"];
    const headerAdminRaw = req.headers?.["x-admin-secret"];
    const authRaw = req.headers?.authorization;
    const headerCron = Array.isArray(headerCronRaw) ? headerCronRaw[0] : headerCronRaw;
    const headerAdmin = Array.isArray(headerAdminRaw) ? headerAdminRaw[0] : headerAdminRaw;
    const authHeader = Array.isArray(authRaw) ? authRaw[0] : authRaw;
    const bearer = typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!expectedSecret) {
      res.status(401).json({
        ok: false,
        error: "Unauthorized",
        authReason: "missing_server_secret",
        detail: "Missing CRON_SECRET/ADMIN_SECRET on server.",
      });
      return;
    }

    const matched = headerCron === expectedSecret || headerAdmin === expectedSecret || bearer === expectedSecret;
    if (!matched) {
      res.status(401).json({
        ok: false,
        error: "Unauthorized",
        authReason: "secret_mismatch",
        detail: "Provide matching secret via x-cron-secret, x-admin-secret, or Authorization: Bearer <secret>.",
      });
      return;
    }
    if (!requireFmpApiKey()) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    await ensureSchema();

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    const explicitSymbols = Array.isArray(body.symbols)
      ? body.symbols.map((item: unknown) => String(item).trim().toUpperCase()).filter(Boolean)
      : [];
    const rawOffset = Number(req.query?.offset ?? body.offset ?? 0);
    const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
    const rawBatchSize = Number(req.query?.batchSize ?? body.batchSize ?? 10);
    const batchSize = Math.max(1, Math.min(10, Number.isFinite(rawBatchSize) ? Math.floor(rawBatchSize) : 10));

    markRunning("resolve_targets", {
      requestedSymbols: explicitSymbols.slice(0, 20),
      requestedCount: explicitSymbols.length,
      offset,
      batchSize,
      requestStartedAt: requestStartIso,
    });
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
    markDone("resolve_targets", "success", {
      resolvedCount: symbols.length,
      resolvedSample: symbols.slice(0, 20),
    });

    if (symbols.length === 0) {
      markDone("load_symbols_batch", "skipped", { reason: "no_targets" });
      for (const key of [
        "fetch_price_data", "normalize_parse_response", "validate_required_fields", "transform_daily_rows",
        "write_daily_history", "load_recent_window", "compute_snapshot", "write_snapshot",
      ]) {
        markDone(key, "skipped", { reason: "no_targets" });
      }
      markRunning("finalize_response");
      markDone("finalize_response", "success");
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
        debug: {
          steps: debugSteps,
          lastCompletedStep,
          failedStep: null,
          timeoutStage: null,
          requestStartedAt: requestStartIso,
          requestEndedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        },
      });
      return;
    }

    const totalToProcess = symbols.length;
    markRunning("load_symbols_batch");
    const runSymbols = symbols.slice(offset, offset + batchSize);
    markDone("load_symbols_batch", "success", {
      runSymbols: runSymbols.slice(0, 20),
      runCount: runSymbols.length,
      totalToProcess,
      offset,
      batchSize,
    });
    if (runSymbols.length === 0) {
      for (const key of [
        "fetch_price_data", "normalize_parse_response", "validate_required_fields", "transform_daily_rows",
        "write_daily_history", "load_recent_window", "compute_snapshot", "write_snapshot",
      ]) {
        markDone(key, "skipped", { reason: "offset_out_of_range" });
      }
      markRunning("finalize_response");
      markDone("finalize_response", "success");
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
        debug: {
          steps: debugSteps,
          lastCompletedStep,
          failedStep: null,
          timeoutStage: null,
          requestStartedAt: requestStartIso,
          requestEndedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        },
      });
      return;
    }

    markRunning("fetch_price_data", { source: "fmp", symbols: runSymbols });
    markRunning("normalize_parse_response");
    markRunning("validate_required_fields");
    markRunning("transform_daily_rows");
    markRunning("write_daily_history");
    markRunning("load_recent_window");
    markRunning("compute_snapshot");
    markRunning("write_snapshot");
    const result = await ingestManySymbols({ symbols: runSymbols, debug: true });
    const failureCount = result.failures.length;
    const successStatus: "failed" | "success" = failureCount > 0 ? "failed" : "success";
    markDone("fetch_price_data", successStatus, {
      failedSymbols: result.failures.slice(0, 10).map((item) => item.symbol),
      failures: result.failures.slice(0, 10),
    }, failureCount > 0 ? "One or more symbol ingests failed." : undefined);
    markDone("normalize_parse_response", successStatus, {
      processedSymbols: result.succeeded,
      failedSymbols: result.failed,
    }, failureCount > 0 ? "See symbol failures." : undefined);
    markDone("validate_required_fields", successStatus, {
      processedSymbols: result.succeeded,
      failedSymbols: result.failed,
    }, failureCount > 0 ? "See symbol failures." : undefined);
    markDone("transform_daily_rows", successStatus, {
      writtenDailyRows: result.writtenDailyRows,
    }, failureCount > 0 ? "See symbol failures." : undefined);
    markDone("write_daily_history", successStatus, {
      writtenDailyRows: result.writtenDailyRows,
      changedSymbols: result.changedSymbols,
    }, failureCount > 0 ? "See symbol failures." : undefined);
    markDone("load_recent_window", successStatus, {}, failureCount > 0 ? "See symbol failures." : undefined);
    markDone("compute_snapshot", successStatus, {
      snapshotWrites: result.snapshotWrites,
      sampleSnapshotDebug: (result.results ?? []).slice(0, 5).map((item) => ({
        symbol: item.symbol,
        snapshotUpdated: item.snapshotUpdated,
        debug: item.debug ?? null,
      })),
    }, failureCount > 0 ? "See symbol failures." : undefined);
    markDone("write_snapshot", successStatus, {
      snapshotWrites: result.snapshotWrites,
    }, failureCount > 0 ? "See symbol failures." : undefined);
    const processedInRun = runSymbols.length;
    const processedTotal = Math.min(totalToProcess, offset + processedInRun);
    const remaining = Math.max(0, totalToProcess - processedTotal);
    const done = remaining === 0;
    const nextOffset = done ? null : processedTotal;
    markRunning("finalize_response", { nextOffset, remaining, processedInRun, totalToProcess });
    markDone("finalize_response", "success");

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
      debug: {
        steps: debugSteps,
        lastCompletedStep,
        failedStep: result.ok ? null : "fetch_price_data",
        timeoutStage: null,
        requestStartedAt: requestStartIso,
        requestEndedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
