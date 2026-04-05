import { ensureSchema } from "../../../../../api/_migrate.js";
import {
  getPortfolioOverviewLatest,
  type PortfolioOverviewTraceRecorder,
  type PortfolioOverviewTraceRow,
} from "../../../../lib/portfolio-overview/latest.js";
import { buildPortfolioSnapshots } from "../../../../lib/portfolio-snapshots/build.js";
import { buildPortfolioHistory } from "../../../../lib/portfolio-history/build.js";

const OVERVIEW_TIMEOUT_MS = 10_000;
const FALLBACK_BUILD_TIMEOUT_MS = 6_000;
const FALLBACK_BUILD_COOLDOWN_MS = 30_000;
let fallbackBuildInFlight: Promise<void> | null = null;
let lastFallbackBuildAtMs = 0;

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

function shouldAttemptFallbackBuild(payload: any): boolean {
  if (!payload) return true;
  const noSnapshots = !payload.as_of_date;
  const noHistory = Number(payload?.performance?.history_available_days ?? 0) <= 0;
  const setupState = String(payload?.setup?.setup_state ?? "");
  return noSnapshots || noHistory || setupState === "configured_positions_no_snapshot";
}

async function runFallbackBuild(trace: PortfolioOverviewTraceRow[]) {
  const nowMs = Date.now();
  if (fallbackBuildInFlight) {
    await fallbackBuildInFlight;
    return;
  }
  if (nowMs - lastFallbackBuildAtMs < FALLBACK_BUILD_COOLDOWN_MS) {
    trace.push({
      stage: "fallback_build_skipped_cooldown",
      ok: true,
      started_at: nowIso(),
      duration_ms: 0,
    });
    return;
  }

  fallbackBuildInFlight = (async () => {
    await runStage(trace, "fallback_snapshot_build", async () => {
      await withTimeout(buildPortfolioSnapshots(), FALLBACK_BUILD_TIMEOUT_MS);
    });
    await runStage(trace, "fallback_history_build", async () => {
      await withTimeout(buildPortfolioHistory(), FALLBACK_BUILD_TIMEOUT_MS);
    });
    lastFallbackBuildAtMs = Date.now();
  })();

  try {
    await fallbackBuildInFlight;
  } finally {
    fallbackBuildInFlight = null;
  }
}

export default async function handler(req: any, res: any) {
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
    let payload = await runStage(trace, "overview_load", async () =>
      withTimeout(getPortfolioOverviewLatest(debug, traceRecorder), OVERVIEW_TIMEOUT_MS)
    );
    if (shouldAttemptFallbackBuild(payload)) {
      await runStage(trace, "fallback_build_guarded", async () => {
        await runFallbackBuild(trace);
      });
      payload = await runStage(trace, "overview_reload_after_fallback", async () =>
        withTimeout(getPortfolioOverviewLatest(debug, traceRecorder), OVERVIEW_TIMEOUT_MS)
      );
    }
    trace.push({ stage: "response_sent", ok: true, duration_ms: 0, started_at: nowIso() });
    res.status(200).json({
      ok: true,
      ...payload,
      ...(debug ? { trace } : {}),
    });
  } catch (error) {
    const debug = String(req.query?.debug ?? "") === "1";
    const errorMessage = (error as Error).message;
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
        ...(debug ? { debug: true } : {}),
      },
    });
  }
}
