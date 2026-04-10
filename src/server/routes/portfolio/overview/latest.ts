import { ensureSchema } from "../../../../../api/_migrate.js";
import { getDbDebugState } from "../../../../../api/_db.js";
import {
  getPortfolioOverviewLatest,
  type PortfolioOverviewTraceRecorder,
  type PortfolioOverviewTraceRow,
} from "../../../../lib/portfolio-overview/latest.js";

const OVERVIEW_TIMEOUT_MS = 10_000;

function nowIso() {
  return new Date().toISOString();
}

async function runStage<T>(
  trace: PortfolioOverviewTraceRow[],
  stage: string,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = nowIso();
  const startMs = Date.now();
  try {
    const result = await fn();
    trace.push({
      stage,
      ok: true,
      started_at: startedAt,
      duration_ms: Date.now() - startMs,
    });
    return result;
  } catch (error) {
    trace.push({
      stage,
      ok: false,
      started_at: startedAt,
      duration_ms: Date.now() - startMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`overview_timeout_${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async function handler(req: any, res: any) {
  const requestStartedMs = Date.now();
  const trace: PortfolioOverviewTraceRow[] = [
    { stage: "request_received", ok: true, duration_ms: 0, started_at: nowIso() },
  ];

  const traceRecorder: PortfolioOverviewTraceRecorder = {
    runStage: async <T>(stage: string, fn: () => Promise<T>) => runStage(trace, stage, fn),
  };

  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    await runStage(trace, "db_connection_acquired", async () => {
      await ensureSchema();
    });
    const debug = String(req.query?.debug ?? "") === "1";
    let didTimeout = false;
    let didFallbackToMaterialized = false;
    let fallbackReason: string | null = null;
    let readPathMode: "materialized_only" | "inline_compute" | "fallback_stale" = "materialized_only";
    let payload = await runStage(trace, "overview_load", async () =>
      withTimeout(getPortfolioOverviewLatest(debug, traceRecorder), OVERVIEW_TIMEOUT_MS)
    );
    const responseAssembleStartedMs = Date.now();
    trace.push({ stage: "response_sent", ok: true, duration_ms: 0, started_at: nowIso() });
    const dbConnectionMs = trace.find((row) => row.stage === "db_connection_acquired")?.duration_ms ?? 0;
    const materializedReadMs = trace.find((row) => row.stage === "overview_load")?.duration_ms ?? 0;
    const serializationMs = Math.max(0, Date.now() - responseAssembleStartedMs);
    res.status(200).json({
      ok: true,
      ...payload,
      ...(debug
        ? {
          trace,
          read_path_debug: {
            read_path_mode: readPathMode,
            materialized_source_table: "portfolio_snapshots,portfolio_history_daily,total_portfolio_history_daily",
            materialized_as_of_date: payload?.as_of_date ?? null,
            materialized_last_build: payload?.pipeline_status?.last_history_build ?? null,
            inline_compute_attempted: false,
            inline_compute_skipped_reason: "overview_route_materialized_read_path_only",
            timeout_budget_ms: OVERVIEW_TIMEOUT_MS,
            did_timeout: didTimeout,
            did_fallback_to_materialized: didFallbackToMaterialized,
            fallback_reason: fallbackReason,
            db_connection_ms: dbConnectionMs,
            materialized_read_ms: materializedReadMs,
            serialization_ms: serializationMs,
            total_ms: Date.now() - requestStartedMs,
            ...getDbDebugState(),
          },
        }
        : {}),
    });
  } catch (error) {
    const debug = String(req.query?.debug ?? "") === "1";
    const errorMessage = (error as Error).message;
    if (errorMessage.includes("overview_timeout_")) {
      try {
        const fallbackPayload = await getPortfolioOverviewLatest(debug, traceRecorder);
        const responseAssembleStartedMs = Date.now();
        trace.push({ stage: "overview_timeout_fallback_materialized", ok: true, duration_ms: 0, started_at: nowIso() });
        trace.push({ stage: "response_sent", ok: true, duration_ms: 0, started_at: nowIso() });
        const dbConnectionMs = trace.find((row) => row.stage === "db_connection_acquired")?.duration_ms ?? 0;
        const materializedReadMs = trace.find((row) => row.stage === "overview_load")?.duration_ms ?? OVERVIEW_TIMEOUT_MS;
        const serializationMs = Math.max(0, Date.now() - responseAssembleStartedMs);
        res.status(200).json({
          ok: true,
          ...fallbackPayload,
          warning: {
            type: "timed_out_live_refresh",
            message: "Live refresh timed out, showing latest completed build.",
          },
          ...(debug
            ? {
              trace,
              read_path_debug: {
                read_path_mode: "fallback_stale",
                materialized_source_table: "portfolio_snapshots,portfolio_history_daily,total_portfolio_history_daily",
                materialized_as_of_date: fallbackPayload?.as_of_date ?? null,
                materialized_last_build: fallbackPayload?.pipeline_status?.last_history_build ?? null,
                inline_compute_attempted: false,
                inline_compute_skipped_reason: "overview_route_materialized_read_path_only",
                timeout_budget_ms: OVERVIEW_TIMEOUT_MS,
                did_timeout: true,
                did_fallback_to_materialized: true,
                fallback_reason: "overview_timeout_budget_exceeded",
                db_connection_ms: dbConnectionMs,
                materialized_read_ms: materializedReadMs,
                serialization_ms: serializationMs,
                total_ms: Date.now() - requestStartedMs,
                ...getDbDebugState(),
              },
            }
            : {}),
        });
        return;
      } catch {
        // Fall through to error response when fallback materialized read is unavailable.
      }
    }
    const failedStage = [...trace].reverse().find((row) => row.ok === false)?.stage
      ?? (errorMessage.includes("overview_timeout_") ? "overview_load" : "unknown");
    const userMessage = errorMessage.includes("overview_timeout_")
      ? "Portfolio dashboard request timed out before completion."
      : "Portfolio dashboard is temporarily unavailable.";
    res.status(500).json({
      ok: false,
      error: {
        type: "portfolio_overview_error",
        message: userMessage,
        debugMessage: errorMessage,
        stage: failedStage,
        trace,
        db_debug: getDbDebugState(),
        ...(debug ? { debug: true } : {}),
      },
    });
  }
}
