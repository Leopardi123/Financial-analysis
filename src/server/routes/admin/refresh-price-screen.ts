import { getAdminSecret } from "../../../../api/_auth.js";
import { query, execute } from "../../../../api/_db.js";
import { ensureSchema, tables } from "../../../../api/_migrate.js";
import { requireFmpApiKey } from "../../../../api/_fmp.js";
import { ingestDailyPricesAndRefreshSnapshot } from "../../../lib/prices/screening/ingest.js";

let cachedActiveSymbols: { symbols: string[]; loadedAt: number } | null = null;
const SYMBOL_CACHE_TTL_MS = 5 * 60 * 1000;
const STATE_SCOPE = "default";

type PersistedStateRow = {
  symbols_json: string;
  total_count: number;
  offset: number;
  status: string;
  targets_source: string;
  last_controller_stage: string | null;
  last_worker_started: number;
  last_error: string | null;
  updated_at: string;
};

type PersistedControllerPayload = {
  targets: string[];
  failures?: Array<Record<string, unknown>>;
  retryMap?: Record<string, number>;
  retryPhase?: boolean;
  lastBatchSummary?: Record<string, unknown> | null;
  workerRunning?: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    }),
  ]);
}

function detectStage(errorMessage: string): string {
  const message = errorMessage.toLowerCase();
  if (message.includes("fetch")) return "fetch_price_data";
  if (message.includes("db")) return "write_daily_history";
  if (message.includes("timeout")) return "timeout";
  return "unknown";
}

type StateDiagnostics = {
  stateFound: boolean;
  stateValid: boolean;
  targetsPersisted: boolean;
  targetsCount: number;
  cursorValue: number | null;
  stateStatus: string | null;
  stateUpdatedAt: string | null;
  cronLastTouchedState: "yes" | "no" | "unknown";
  lockPresent: boolean;
  targetsSourceUnknownReason: string | null;
  stateError: string | null;
};

async function loadActiveSymbols(): Promise<string[]> {
  const now = Date.now();
  if (cachedActiveSymbols && now - cachedActiveSymbols.loadedAt < SYMBOL_CACHE_TTL_MS) {
    return cachedActiveSymbols.symbols;
  }
  const rows = await withTimeout(query(
    `SELECT ticker
     FROM ${tables.companiesV2}
     WHERE active = 1
     ORDER BY ticker`,
  ), 2000, "db_load_targets") as unknown as Array<{ ticker: string }>;
  const symbols = rows.map((row) => String(row.ticker).trim().toUpperCase()).filter(Boolean);
  cachedActiveSymbols = { symbols, loadedAt: now };
  return symbols;
}

async function readPersistedState(): Promise<PersistedStateRow | null> {
  const rows = await withTimeout(query(
    `SELECT symbols_json, total_count, offset, status, targets_source, last_controller_stage, last_worker_started, last_error, updated_at
     FROM ${tables.screeningPriceRefreshState}
     WHERE scope = ?
     LIMIT 1`,
    [STATE_SCOPE],
  ), 2000, "db_read_state") as unknown as PersistedStateRow[];
  return rows[0] ?? null;
}

async function writePersistedState(next: {
  symbols: string[] | PersistedControllerPayload;
  offset: number;
  status: "idle" | "running" | "paused" | "done" | "error";
  targetsSource: "fresh" | "persisted" | "request_symbols";
  lastControllerStage: string;
  lastWorkerStarted: boolean;
  lastError?: string | null;
}): Promise<void> {
  const serializedPayload = Array.isArray(next.symbols)
    ? JSON.stringify(next.symbols)
    : JSON.stringify(next.symbols);
  const targetCount = Array.isArray(next.symbols)
    ? next.symbols.length
    : next.symbols.targets.length;
  await withTimeout(execute(
    `INSERT INTO ${tables.screeningPriceRefreshState}
      (scope, symbols_json, total_count, offset, status, targets_source, last_controller_stage, last_worker_started, last_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET
      symbols_json = excluded.symbols_json,
      total_count = excluded.total_count,
      offset = excluded.offset,
      status = excluded.status,
      targets_source = excluded.targets_source,
      last_controller_stage = excluded.last_controller_stage,
      last_worker_started = excluded.last_worker_started,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at`,
    [
      STATE_SCOPE,
      serializedPayload,
      targetCount,
      Math.max(0, next.offset),
      next.status,
      next.targetsSource,
      next.lastControllerStage,
      next.lastWorkerStarted ? 1 : 0,
      next.lastError ?? null,
      new Date().toISOString(),
    ],
  ), 2000, "db_write_state");
}

async function classifyHeavyCandidates(symbols: string[]): Promise<Set<string>> {
  const heavy = new Set<string>();
  for (const symbol of symbols) {
    const historyRows = await withTimeout(query(
      `SELECT COUNT(*) AS c FROM ${tables.dailyPriceHistory} WHERE symbol = ?`,
      [symbol],
    ), 2000, "db_classify_history") as Array<{ c?: number | string }>;
    const snapshotRows = await withTimeout(query(
      `SELECT 1 AS has_row FROM ${tables.priceScreenSnapshot} WHERE symbol = ? LIMIT 1`,
      [symbol],
    ), 2000, "db_classify_snapshot") as Array<{ has_row?: number }>;
    const historyCount = Number(historyRows[0]?.c ?? 0);
    const hasSnapshot = snapshotRows.length > 0;
    if (!hasSnapshot || historyCount < 50) {
      heavy.add(symbol);
    }
  }
  return heavy;
}

function parsePersistedSymbols(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as PersistedControllerPayload).targets)) {
      return (parsed as PersistedControllerPayload).targets.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

function parsePersistedPayload(raw: string): PersistedControllerPayload {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { targets: parsed.map((item) => String(item).trim().toUpperCase()).filter(Boolean) };
    }
    if (parsed && typeof parsed === "object") {
      const payload = parsed as PersistedControllerPayload;
      return {
        targets: Array.isArray(payload.targets) ? payload.targets.map((item) => String(item).trim().toUpperCase()).filter(Boolean) : [],
        failures: Array.isArray(payload.failures) ? payload.failures : [],
        retryMap: payload.retryMap && typeof payload.retryMap === "object" ? payload.retryMap : {},
        retryPhase: Boolean(payload.retryPhase),
        lastBatchSummary: payload.lastBatchSummary ?? null,
        workerRunning: Boolean(payload.workerRunning),
      };
    }
  } catch {
    // noop
  }
  return { targets: [] };
}

export default async function handler(req: any, res: any) {
  try {
    const startedAt = Date.now();
    const requestStartIso = new Date(startedAt).toISOString();
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
    let controllerStopStage: string = "request_started";
    let workerStarted = false;
    let targetsSource: "fresh" | "persisted" | "request_symbols" = "fresh";
    let targetsRecomputed = false;
    const stateDiagnostics: StateDiagnostics = {
      stateFound: false,
      stateValid: false,
      targetsPersisted: false,
      targetsCount: 0,
      cursorValue: null,
      stateStatus: null,
      stateUpdatedAt: null,
      cronLastTouchedState: "unknown",
      lockPresent: false,
      targetsSourceUnknownReason: null,
      stateError: null,
    };
    const markRunning = (key: string, details?: Record<string, unknown>) => {
      const step = debugSteps.find((item) => item.key === key);
      if (!step) return;
      lastStartedStep = key;
      controllerStopStage = key;
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
      controllerStopStage = key;
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
    const inspectStateOnly = Boolean(body.inspectState);
    const reset = Boolean(body.reset);
    const requestedOffsetRaw = Number(req.query?.offset ?? body.offset ?? 0);
    const requestedOffset = Number.isFinite(requestedOffsetRaw) ? Math.max(0, Math.floor(requestedOffsetRaw)) : 0;
    const rawBatchSize = Number(req.query?.batchSize ?? body.batchSize ?? 1);
    const batchSize = Math.max(1, Math.min(3, Number.isFinite(rawBatchSize) ? Math.floor(rawBatchSize) : 1));

    let persistedState: PersistedStateRow | null = null;
    try {
      persistedState = await readPersistedState();
    } catch (error) {
      persistedState = null;
      stateDiagnostics.stateError = `read_state_failed: ${(error as Error).message}`;
      stateDiagnostics.targetsSourceUnknownReason = "Persisted controller state could not be read.";
    }
    stateDiagnostics.stateFound = Boolean(persistedState);
    stateDiagnostics.stateStatus = persistedState?.status ?? null;
    stateDiagnostics.stateUpdatedAt = persistedState?.updated_at ?? null;
    stateDiagnostics.cursorValue = persistedState ? Math.max(0, Math.floor(Number(persistedState.offset ?? 0))) : null;
    stateDiagnostics.lockPresent = Boolean(
      persistedState
      && persistedState.status === "running"
      && persistedState.updated_at
      && (Date.now() - new Date(persistedState.updated_at).getTime()) < 10 * 60 * 1000
    );
    if (persistedState) {
      const cronRows = await query(
        `SELECT run_at FROM ${tables.fetchLog}
         WHERE ticker = '__cron_refresh_lock__' AND period = 'lock' AND statement = 'refresh'
         ORDER BY run_at DESC
         LIMIT 1`
      ) as unknown as Array<{ run_at: string }>;
      const latestCron = cronRows[0]?.run_at ? new Date(cronRows[0].run_at).getTime() : null;
      const stateUpdated = persistedState.updated_at ? new Date(persistedState.updated_at).getTime() : null;
      if (!latestCron || !stateUpdated) {
        stateDiagnostics.cronLastTouchedState = "unknown";
      } else {
        // Current code path does not let cron write this table; mark explicit "no".
        stateDiagnostics.cronLastTouchedState = "no";
      }
    }
    let persistedSymbols: string[] = [];
    let persistedPayload: PersistedControllerPayload = { targets: [] };
    let persistedStateValid = false;
    if (persistedState) {
      persistedPayload = parsePersistedPayload(persistedState.symbols_json);
      persistedSymbols = parsePersistedSymbols(persistedState.symbols_json);
      const persistedOffset = Number.isFinite(Number(persistedState.offset))
        ? Math.max(0, Math.floor(Number(persistedState.offset)))
        : -1;
      const staleRunningState = persistedState.status === "running"
        && persistedState.updated_at
        && (Date.now() - new Date(persistedState.updated_at).getTime()) > 24 * 60 * 60 * 1000;
      persistedStateValid = persistedSymbols.length > 0
        && persistedOffset >= 0
        && persistedOffset <= persistedSymbols.length
        && !staleRunningState;
      stateDiagnostics.targetsPersisted = persistedSymbols.length > 0;
      stateDiagnostics.targetsCount = persistedSymbols.length;
      stateDiagnostics.stateValid = persistedStateValid;
      if (!persistedStateValid) {
        stateDiagnostics.targetsSourceUnknownReason = staleRunningState
          ? "Persisted state is stale running state older than 24h."
          : "Persisted state is incomplete/invalid (symbols or cursor).";
      }
    }

    if (inspectStateOnly) {
      res.status(200).json({
        ok: true,
        inspectState: true,
        state: persistedState ? {
          scope: STATE_SCOPE,
          offset: Number(persistedState.offset ?? 0),
          totalCount: Number(persistedState.total_count ?? 0),
          status: persistedState.status ?? null,
          targetsSource: persistedState.targets_source ?? null,
          lastControllerStage: persistedState.last_controller_stage ?? null,
          lastWorkerStarted: Number(persistedState.last_worker_started ?? 0) === 1,
          lastError: persistedState.last_error ?? null,
          updatedAt: persistedState.updated_at ?? null,
          symbolsCount: persistedSymbols.length,
          symbolsSample: persistedSymbols.slice(0, 20),
          retryMap: persistedPayload.retryMap ?? {},
          retryPhase: Boolean(persistedPayload.retryPhase),
          failuresCount: Array.isArray(persistedPayload.failures) ? persistedPayload.failures.length : 0,
          lastBatchSummary: persistedPayload.lastBatchSummary ?? null,
          workerRunning: Boolean(persistedPayload.workerRunning),
        } : null,
        stateDiagnostics,
      });
      return;
    }

    markRunning("resolve_targets", {
      requestedSymbols: explicitSymbols.slice(0, 20),
      requestedCount: explicitSymbols.length,
      requestedOffset,
      reset,
      batchSize,
      requestStartedAt: requestStartIso,
      persistedStatePresent: Boolean(persistedState),
    });

    let symbols = explicitSymbols;
    let offset = requestedOffset;
    if (explicitSymbols.length > 0) {
      targetsSource = "request_symbols";
      targetsRecomputed = true;
      stateDiagnostics.targetsSourceUnknownReason = null;
    } else if (!reset && persistedState && persistedStateValid) {
      if (persistedSymbols.length > 0) {
        symbols = persistedSymbols;
        offset = Number.isFinite(Number(persistedState.offset)) ? Math.max(0, Math.floor(Number(persistedState.offset))) : requestedOffset;
        targetsSource = "persisted";
        stateDiagnostics.targetsSourceUnknownReason = null;
      } else {
        symbols = await loadActiveSymbols();
        targetsSource = "fresh";
        targetsRecomputed = true;
      }
    } else {
      symbols = await loadActiveSymbols();
      offset = 0;
      targetsSource = "fresh";
      targetsRecomputed = true;
      stateDiagnostics.targetsSourceUnknownReason = persistedState
        ? (stateDiagnostics.targetsSourceUnknownReason ?? "Persisted state invalid, rebuilt from active universe.")
        : "No persisted state found, bootstrapped fresh run.";
      await writePersistedState({
        symbols,
        offset: 0,
        status: "running",
        targetsSource,
        lastControllerStage: "resolve_targets",
        lastWorkerStarted: false,
        lastError: stateDiagnostics.targetsSourceUnknownReason,
      });
      stateDiagnostics.stateFound = true;
      stateDiagnostics.stateValid = symbols.length > 0;
      stateDiagnostics.targetsPersisted = symbols.length > 0;
      stateDiagnostics.targetsCount = symbols.length;
      stateDiagnostics.cursorValue = 0;
      stateDiagnostics.stateStatus = "running";
      stateDiagnostics.stateUpdatedAt = new Date().toISOString();
    }

    markDone("resolve_targets", "success", {
      resolvedCount: symbols.length,
      resolvedSample: symbols.slice(0, 20),
      targetsSource,
      targetsRecomputed,
      offset,
      stateFound: stateDiagnostics.stateFound,
      stateValid: stateDiagnostics.stateValid,
      targetsPersisted: stateDiagnostics.targetsPersisted,
      targetsCount: stateDiagnostics.targetsCount,
      cursorValue: stateDiagnostics.cursorValue,
      cronLastTouchedState: stateDiagnostics.cronLastTouchedState,
      lockPresent: stateDiagnostics.lockPresent,
      targetsSourceUnknownReason: stateDiagnostics.targetsSourceUnknownReason,
    });

    if (symbols.length === 0) {
      await writePersistedState({
        symbols,
        offset: 0,
        status: "done",
        targetsSource,
        lastControllerStage: "resolve_targets",
        lastWorkerStarted: false,
        lastError: null,
      });
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
        stateDiagnostics,
        cursor: { offset: 0, nextOffset: null, done: true, processedInRun: 0, totalToProcess: 0, remaining: 0, batchSize },
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
          controllerStopStage,
          workerStarted,
          targetsSource,
          targetsRecomputed,
          dispatchStatus: "controller_no_targets",
          stateDiagnostics,
        },
      });
      return;
    }

    const totalToProcess = symbols.length;
    markRunning("load_symbols_batch", { targetsSource, targetsRecomputed });
    const runSymbols = symbols.slice(offset, offset + batchSize);
    markDone("load_symbols_batch", "success", {
      runSymbols: runSymbols.slice(0, 20),
      runCount: runSymbols.length,
      totalToProcess,
      offset,
      batchSize,
      targetsSource,
      targetsRecomputed,
    });
    if (runSymbols.length === 0) {
      await writePersistedState({
        symbols,
        offset: totalToProcess,
        status: "done",
        targetsSource,
        lastControllerStage: "load_symbols_batch",
        lastWorkerStarted: false,
        lastError: null,
      });
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
        stateDiagnostics,
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
          controllerStopStage,
          workerStarted,
          targetsSource,
          targetsRecomputed,
          dispatchStatus: "controller_done_before_dispatch",
          stateDiagnostics,
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
    const perSymbolTiming: Array<Record<string, unknown>> = [];
    const heavySymbolDiagnostics: Array<Record<string, unknown>> = [];
    const isRetryableFailure = (failure: { error: string; classification?: string; stage?: string }) => {
      if (failure.classification === "timeout_during_symbol_fetch" || failure.classification === "fmp_fetch_failed") return true;
      return /timed out|timeout|network|ECONN|ENOTFOUND|429|503|502|504|fetch/i.test(failure.error);
    };
    const isWriteFailure = (failure: { error: string; classification?: string; stage?: string }) => {
      if (failure.stage === "write_daily_price_history" || failure.stage === "write_price_screen_snapshot") return true;
      if (failure.classification === "duplicate_row_conflict" || failure.classification === "db_write_failed") return true;
      return /SQLITE|constraint|database|daily_price_history|price_screen_snapshot/i.test(failure.error);
    };

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
    const heavyCandidates = await classifyHeavyCandidates(runSymbols);
    let recoveredFromFallback = false;
    workerStarted = true;

    while (pending.length > 0) {
      let chunk = pending.slice(0, currentBatchSize);
      if (chunk.length > 1) {
        const forcedHeavy = chunk.find((symbol) => heavyCandidates.has(symbol));
        if (forcedHeavy) {
          chunk = [forcedHeavy];
          pending = [forcedHeavy, ...pending.filter((symbol) => symbol !== forcedHeavy)];
          adaptiveMessages.push(`Isolated heavy/backfill candidate ${forcedHeavy} into single-symbol chunk`);
        }
      }
      attemptedBatchSizes.push(currentBatchSize);
      const chunkFailures: Array<{ symbol: string; error: string; stage?: string; classification?: string; context?: Record<string, unknown>; durationMs?: number; attempt?: number }> = [];
      const chunkSuccesses: Array<Record<string, unknown>> = [];

      for (const symbol of chunk) {
        const symbolStartedAt = Date.now();
        try {
          const item = await ingestDailyPricesAndRefreshSnapshot(symbol, true);
          chunkSuccesses.push(item as unknown as Record<string, unknown>);
        } catch (error) {
          const message = (error as Error).message;
          const retryMap = persistedPayload.retryMap ?? {};
          const attempt = Number(retryMap[symbol] ?? 0) + 1;
          chunkFailures.push({
            symbol,
            error: message,
            stage: detectStage(message),
            classification: message.includes("timeout") ? "timeout_during_symbol_fetch" : "unknown",
            durationMs: Date.now() - symbolStartedAt,
            attempt,
          });
        }
      }

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
        const ingestDebug = item.ingestDebug as Record<string, unknown> | undefined;
        if (ingestDebug?.timingMs) {
          perSymbolTiming.push({
            symbol: item.symbol ?? "unknown",
            timingMs: ingestDebug.timingMs,
            historicalRowsReturned: ingestDebug.historicalRowsReturned ?? ingestDebug.fmpRowsReturned ?? null,
            insertedRows: ingestDebug.insertedRows ?? (Number(item.inserted ?? 0) + Number(item.updated ?? 0)),
            isBackfill: ingestDebug.isBackfill ?? false,
            isHeavySymbol: ingestDebug.isHeavySymbol ?? false,
          });
        }
        if (ingestDebug?.isBackfill || ingestDebug?.isHeavySymbol) {
          heavySymbolDiagnostics.push({
            symbol: item.symbol ?? "unknown",
            isBackfill: Boolean(ingestDebug?.isBackfill),
            isHeavySymbol: Boolean(ingestDebug?.isHeavySymbol),
            historicalRowsReturned: ingestDebug?.historicalRowsReturned ?? null,
            insertedRows: ingestDebug?.insertedRows ?? null,
          });
        }
      }

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

      const retryableFailures = chunkFailures.filter((item) => isRetryableFailure(item));
      const nonRetryableFailures = chunkFailures.filter((item) => !isRetryableFailure(item));

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
    const fetchFailed = failures.some((item) => isRetryableFailure(item));
    const writeFailed = failures.some((item) => isWriteFailure(item));
    const topLevelStatus = failureCount > 0 && succeeded > 0
      ? "partial_success"
      : (failureCount > 0 ? "error" : "success");
    const sharedDetails = {
      processedSymbols: succeeded,
      failedSymbols: failed,
      currentSymbols: runSymbols,
      attemptedBatchSizes,
      adaptiveMessages,
      perSymbolTiming,
      heavySymbolDiagnostics,
    };
    const slowSymbols = perSymbolTiming
      .filter((item) => Number((item.timingMs as Record<string, unknown> | undefined)?.total ?? 0) > 2000)
      .map((item) => String(item.symbol ?? ""));
    const retryAttempts = Object.entries(persistedPayload.retryMap ?? {}).map(([symbol, attempts]) => ({ symbol, attempts }));
    markDone("fetch_price_data", fetchFailed ? "failed" : "success", { ...sharedDetails, failures: failures.slice(0, 10) }, fetchFailed ? "Fetch/network failures detected." : undefined);
    const noSuccessfulProcessing = succeeded === 0 && fetchFailed;
    if (noSuccessfulProcessing) {
      markDone("normalize_parse_response", "skipped", { reason: "fetch_failed_prevented_execution", ...sharedDetails });
      markDone("validate_required_fields", "skipped", { reason: "fetch_failed_prevented_execution", ...sharedDetails });
      markDone("transform_daily_rows", "skipped", { reason: "fetch_failed_prevented_execution", ...sharedDetails, writtenDailyRows, unchangedDailyRows });
      markDone("write_daily_history", "skipped", { reason: "fetch_failed_prevented_execution", ...sharedDetails, writtenDailyRows, unchangedDailyRows, changedSymbols });
      markDone("load_recent_window", "skipped", { reason: "fetch_failed_prevented_execution", ...sharedDetails });
      markDone("compute_snapshot", "skipped", { reason: "fetch_failed_prevented_execution", ...sharedDetails, snapshotWrites });
      markDone("write_snapshot", "skipped", { reason: "fetch_failed_prevented_execution", ...sharedDetails, snapshotWrites });
    } else {
      markDone("normalize_parse_response", "success", sharedDetails);
      markDone("validate_required_fields", "success", sharedDetails);
      markDone("transform_daily_rows", "success", { ...sharedDetails, writtenDailyRows, unchangedDailyRows });
      markDone("write_daily_history", writeFailed ? "failed" : "success", { ...sharedDetails, writtenDailyRows, unchangedDailyRows, changedSymbols }, writeFailed ? "DB/write failures detected." : undefined);
      markDone("load_recent_window", "success", sharedDetails);
      markDone("compute_snapshot", "success", { ...sharedDetails, snapshotWrites });
      markDone("write_snapshot", writeFailed ? "failed" : "success", { ...sharedDetails, snapshotWrites }, writeFailed ? "See write step failures." : undefined);
    }
    const processedInRun = runSymbols.length;
    const processedTotal = Math.min(totalToProcess, offset + processedInRun);
    const remaining = Math.max(0, totalToProcess - processedTotal);
    let done = remaining === 0;
    let nextOffset = done ? null : processedTotal;

    const retryMap = { ...(persistedPayload.retryMap ?? {}) };
    const persistedFailures = Array.isArray(persistedPayload.failures) ? [...persistedPayload.failures] : [];
    for (const failedItem of failures) {
      const symbol = String(failedItem.symbol ?? "");
      if (!symbol) continue;
      retryMap[symbol] = Number(retryMap[symbol] ?? 0) + 1;
      persistedFailures.push(failedItem);
    }
    let enteredRetryPhase = false;
    if (done) {
      const retryable = Object.entries(retryMap)
        .filter(([, attempts]) => Number(attempts) < 3)
        .map(([symbol]) => symbol);
      if (retryable.length > 0) {
        done = false;
        nextOffset = 0;
        symbols = retryable;
        enteredRetryPhase = true;
      }
    }

    const statePayload: PersistedControllerPayload = {
      targets: symbols,
      retryMap,
      retryPhase: enteredRetryPhase,
      failures: persistedFailures,
      workerRunning: false,
      lastBatchSummary: {
        processed: runSymbols.length,
        succeeded: succeeded,
        failed: failures.length,
      },
    };

    await writePersistedState({
      symbols: statePayload,
      offset: nextOffset ?? symbols.length,
      status: done ? "done" : "running",
      targetsSource,
      lastControllerStage: "finalize_response",
      lastWorkerStarted: workerStarted,
      lastError: failureCount > 0 ? failures[0]?.error ?? "batch_failed" : null,
    });
    const stateAfterWrite = await readPersistedState();
    const persistedOffsetAfterWrite = stateAfterWrite ? Number(stateAfterWrite.offset ?? 0) : null;
    const expectedPersistedOffset = nextOffset ?? symbols.length;
    const stalePersistedStateAfterSuccess = persistedOffsetAfterWrite !== expectedPersistedOffset;
    const stateWriteVerification = {
      expectedOffset: expectedPersistedOffset,
      persistedOffsetAfterWrite,
      persistedUpdatedAtAfterWrite: stateAfterWrite?.updated_at ?? null,
      stalePersistedStateAfterSuccess,
    };

    markRunning("finalize_response", { nextOffset, remaining, processedInRun, totalToProcess, workerStarted, targetsSource, targetsRecomputed });
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
      stateDiagnostics,
      stateWriteVerification,
      totalFailuresCount: failures.length,
      lastFailedSymbols: failures.slice(-5).map((item) => item.symbol),
      retryAttempts,
      slowSymbols,
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
        controllerStopStage,
        workerStarted,
        targetsSource,
        targetsRecomputed,
        dispatchStatus: "worker_dispatched",
        stateDiagnostics,
        stateWriteVerification,
        slowSymbols,
        retryAttempts,
      },
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    res.status(status).json({ ok: false, error: (error as Error).message });
  }
}
