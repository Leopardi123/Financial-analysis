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
    let lastStartedStep: string | null = "request_started";
    const markRunning = (key: string, details?: Record<string, unknown>) => {
      const step = debugSteps.find((item) => item.key === key);
      if (!step) return;
      lastStartedStep = key;
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
    const rawBatchSize = Number(req.query?.batchSize ?? body.batchSize ?? 1);
    const batchSize = Math.max(1, Math.min(3, Number.isFinite(rawBatchSize) ? Math.floor(rawBatchSize) : 1));

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
          lastStartedStep,
          currentStage: lastStartedStep,
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
          lastStartedStep,
          currentStage: lastStartedStep,
          failedStep: null,
          timeoutStage: null,
          requestStartedAt: requestStartIso,
          requestEndedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
        },
      });
      return;
    }

    const results: Array<Record<string, unknown>> = [];
    const failures: Array<{ symbol: string; error: string }> = [];
    let succeeded = 0;
    let failed = 0;
    let changedSymbols = 0;
    let writtenDailyRows = 0;
    let snapshotWrites = 0;
    let unchangedDailyRows = 0;
    const adaptiveMessages: string[] = [];
    const attemptedBatchSizes: number[] = [];
    const isRetryableFailure = (message: string) => /timed out|timeout|network|ECONN|ENOTFOUND|429|503|502|504|fetch/i.test(message);
    const isWriteFailure = (message: string) => /SQLITE|constraint|database|daily_price_history|price_screen_snapshot/i.test(message);

    markRunning("fetch_price_data", { source: "fmp", symbols: runSymbols, currentSymbols: runSymbols });
    markRunning("normalize_parse_response", { currentSymbols: runSymbols });
    markRunning("validate_required_fields", { currentSymbols: runSymbols });
    markRunning("transform_daily_rows", { currentSymbols: runSymbols });
    markRunning("write_daily_history", { currentSymbols: runSymbols });
    markRunning("load_recent_window", { currentSymbols: runSymbols });
    markRunning("compute_snapshot", { currentSymbols: runSymbols });
    markRunning("write_snapshot", { currentSymbols: runSymbols });

    const normalBatchSize = batchSize;
    let currentBatchSize = batchSize;
    let pending = [...runSymbols];
    let recoveredFromFallback = false;

    while (pending.length > 0) {
      const chunk = pending.slice(0, currentBatchSize);
      attemptedBatchSizes.push(currentBatchSize);
      const batchResult = await ingestManySymbols({ symbols: chunk, debug: true });
      const chunkFailures = batchResult.failures ?? [];
      const failedSymbols = new Set(chunkFailures.map((item) => item.symbol));
      const chunkSuccesses = (batchResult.results ?? []).filter((item) => !failedSymbols.has(String(item.symbol ?? "")));

      for (const item of chunkSuccesses) {
        results.push(item as unknown as Record<string, unknown>);
        succeeded += 1;
        const inserted = Number(item.inserted ?? 0);
        const updated = Number(item.updated ?? 0);
        const unchanged = Number(item.unchanged ?? 0);
        writtenDailyRows += inserted + updated;
        unchangedDailyRows += unchanged;
        if (inserted > 0 || updated > 0) changedSymbols += 1;
        if (item.snapshotUpdated) snapshotWrites += 1;
      }

      // Remove processed chunk from queue; re-queue failures for retries if needed.
      pending = pending.slice(chunk.length);

      if (chunkFailures.length === 0) {
        if (recoveredFromFallback && currentBatchSize !== normalBatchSize) {
          currentBatchSize = normalBatchSize;
        }
        if (recoveredFromFallback) {
          adaptiveMessages.push(`Resuming normal batch size ${normalBatchSize}`);
          recoveredFromFallback = false;
        }
        continue;
      }

      const retryableFailures = chunkFailures.filter((item) => isRetryableFailure(item.error));
      const nonRetryableFailures = chunkFailures.filter((item) => !isRetryableFailure(item.error));

      for (const item of nonRetryableFailures) {
        failed += 1;
        failures.push(item);
        adaptiveMessages.push(`Symbol ${item.symbol} failed, skipped`);
      }

      if (retryableFailures.length > 0 && currentBatchSize > 1) {
        const nextBatchSize = Math.max(1, Math.floor(currentBatchSize / 2));
        adaptiveMessages.push(`Batch failed at size ${currentBatchSize}, retrying at size ${nextBatchSize}`);
        if (nextBatchSize === 1) {
          adaptiveMessages.push("Retry failed, falling back to single-symbol mode");
        }
        pending = [...retryableFailures.map((item) => item.symbol), ...pending];
        currentBatchSize = nextBatchSize;
        recoveredFromFallback = true;
        continue;
      }

      // Single-symbol fallback mode for retryable failures.
      for (const item of retryableFailures) {
        failed += 1;
        failures.push(item);
        adaptiveMessages.push(`Symbol ${item.symbol} failed, skipped`);
      }
      if (retryableFailures.length > 0) {
        adaptiveMessages.push("Recovered in single-symbol mode");
      }
      currentBatchSize = normalBatchSize;
      recoveredFromFallback = true;
    }
    const failureCount = failures.length;
    const fetchFailed = failures.some((item) => isRetryableFailure(item.error));
    const writeFailed = failures.some((item) => isWriteFailure(item.error));
    const topLevelStatus = failureCount > 0 && succeeded > 0
      ? "partial_success"
      : (failureCount > 0 ? "error" : "success");
    const sharedDetails = {
      processedSymbols: succeeded,
      failedSymbols: failed,
      currentSymbols: runSymbols,
      attemptedBatchSizes,
      adaptiveMessages,
    };
    markDone("fetch_price_data", fetchFailed ? "failed" : "success", { ...sharedDetails, failures: failures.slice(0, 10) }, fetchFailed ? "Fetch/network failures detected." : undefined);
    markDone("normalize_parse_response", "success", sharedDetails);
    markDone("validate_required_fields", "success", sharedDetails);
    markDone("transform_daily_rows", "success", { ...sharedDetails, writtenDailyRows, unchangedDailyRows });
    markDone("write_daily_history", writeFailed ? "failed" : "success", { ...sharedDetails, writtenDailyRows, unchangedDailyRows, changedSymbols }, writeFailed ? "DB/write failures detected." : undefined);
    markDone("load_recent_window", "success", sharedDetails);
    markDone("compute_snapshot", "success", { ...sharedDetails, snapshotWrites });
    markDone("write_snapshot", writeFailed ? "failed" : "success", { ...sharedDetails, snapshotWrites }, writeFailed ? "See write step failures." : undefined);
    const processedInRun = runSymbols.length;
    const processedTotal = Math.min(totalToProcess, offset + processedInRun);
    const remaining = Math.max(0, totalToProcess - processedTotal);
    const done = remaining === 0;
    const nextOffset = done ? null : processedTotal;
    markRunning("finalize_response", { nextOffset, remaining, processedInRun, totalToProcess });
    markDone("finalize_response", "success");

    const ok = failureCount === 0;
    res.status(ok ? 200 : 207).json({
      ok,
      status: topLevelStatus,
      succeeded,
      failed,
      changedSymbols,
      writtenDailyRows,
      unchangedDailyRows,
      snapshotWrites,
      results,
      failures,
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
        lastStartedStep,
        currentStage: lastStartedStep,
        failedStep: ok ? null : "fetch_price_data",
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
