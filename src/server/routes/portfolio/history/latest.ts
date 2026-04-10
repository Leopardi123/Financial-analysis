import { ensureSchema } from "../../../../../api/_migrate.js";
import { CanonicalBuildTimeoutError, readPortfolioHistoryCanonicalLatest } from "../../../../lib/portfolio-history/canonical.js";
import { normalizePortfolioTrendContract } from "../../../../lib/portfolio-history/contract.js";

type RouteStageName =
  | "request_received"
  | "db_connection_acquired"
  | "portfolio_config_load_started"
  | "portfolio_config_load_finished"
  | "positions_load_started"
  | "positions_load_finished"
  | "price_history_load_started"
  | "price_history_load_finished"
  | "fx_history_load_started"
  | "fx_history_load_finished"
  | "canonical_series_build_started"
  | "canonical_series_build_finished"
  | "portfolio_metric_compute_started"
  | "portfolio_metric_compute_finished"
  | "total_aggregation_started"
  | "total_aggregation_finished"
  | "trace/debug_build_started"
  | "trace/debug_build_finished"
  | "response_serialize_started"
  | "response_serialize_finished";

type RouteStage = {
  stage: RouteStageName;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  ok: boolean;
  row_count?: number;
  portfolio_count?: number;
  date_count?: number;
  reason?: string;
};

function parseBool(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "1" || String(value ?? "").trim().toLowerCase() === "true";
}

function parseOptionalBool(value: unknown): boolean | undefined {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return undefined;
}

function parseNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export default async function handler(req: any, res: any) {
  const routeStart = Date.now();
  const routeTrace: RouteStage[] = [];
  let lastCompletedStage: RouteStageName | null = null;
  const pushStage = (stage: RouteStageName, startedMs: number, ok: boolean, extras?: Omit<RouteStage, "stage" | "started_at" | "ended_at" | "duration_ms" | "ok">) => {
    const endedMs = Date.now();
    routeTrace.push({
      stage,
      started_at: new Date(startedMs).toISOString(),
      ended_at: new Date(endedMs).toISOString(),
      duration_ms: endedMs - startedMs,
      ok,
      ...extras,
    });
    if (ok) lastCompletedStage = stage;
  };
  const receivedAt = Date.now();
  pushStage("request_received", receivedAt, true);
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    const schemaStarted = Date.now();
    await ensureSchema();
    pushStage("db_connection_acquired", schemaStarted, true);
    const debug = String(req.query?.debug ?? "") === "1";
    const canonicalAuditFlags = {
      portfolio_id: typeof req.query?.portfolio_id === "string" ? req.query.portfolio_id : null,
      max_portfolios: parseNum(req.query?.max_portfolios),
      limit_days: parseNum(req.query?.limit_days),
      include_positions: parseOptionalBool(req.query?.include_positions),
      compact_mode: parseBool(req.query?.compact_mode),
      skip_total: parseBool(req.query?.skip_total),
      skip_trace: parseBool(req.query?.skip_trace),
      skip_db_evidence: parseBool(req.query?.skip_db_evidence),
      skip_consistency_checks: parseBool(req.query?.skip_consistency_checks),
      skip_debug_sections: parseBool(req.query?.skip_debug_sections),
      max_runtime_ms: parseNum(req.query?.max_runtime_ms),
    };
    const runMatrix = parseBool(req.query?.run_matrix);
    const canonical = await readPortfolioHistoryCanonicalLatest(canonicalAuditFlags);
    for (const stage of canonical.runtime_audit?.runtime_stage_trace ?? []) {
      routeTrace.push({
        stage: stage.stage === "portfolio_config_load_started" ? "portfolio_config_load_started"
          : stage.stage === "portfolio_config_load_finished" ? "portfolio_config_load_finished"
            : stage.stage === "positions_load_started" ? "positions_load_started"
              : stage.stage === "positions_load_finished" ? "positions_load_finished"
                : stage.stage === "price_history_load_started" ? "price_history_load_started"
                  : stage.stage === "price_history_load_finished" ? "price_history_load_finished"
                    : stage.stage === "fx_history_load_started" ? "fx_history_load_started"
                      : stage.stage === "fx_history_load_finished" ? "fx_history_load_finished"
                        : stage.stage === "canonical_series_build_started" ? "canonical_series_build_started"
                          : stage.stage === "canonical_series_build_finished" ? "canonical_series_build_finished"
                            : stage.stage === "portfolio_metric_compute_started" ? "portfolio_metric_compute_started"
                              : stage.stage === "portfolio_metric_compute_finished" ? "portfolio_metric_compute_finished"
                                : stage.stage === "total_aggregation_started" ? "total_aggregation_started"
                                  : "total_aggregation_finished",
        started_at: stage.started_at,
        ended_at: stage.ended_at,
        duration_ms: stage.duration_ms,
        ok: stage.ok,
        row_count: stage.row_count,
        portfolio_count: stage.portfolio_count,
        date_count: stage.date_count,
        reason: stage.reason,
      });
    }

    const portfolioDiagnostics = canonical.portfolios.map((p) => {
      const latestContract = normalizePortfolioTrendContract({
        return_20d: p.return_20d,
        return_65d: p.return_65d,
        return_200d: p.return_200d,
        trend_completeness: p.trend_completeness,
        short_direction: p.short_direction,
        medium_direction: p.medium_direction,
        long_direction: p.long_direction,
        trend_status: p.trend_status,
      });
      return {
        portfolio_id: p.portfolio_id,
        canonical: p,
        latest_contract: latestContract,
      };
    });

    const portfolios = portfolioDiagnostics.map(({ portfolio_id, canonical: p, latest_contract }) => ({
      portfolio_id,
      portfolio_name: p.portfolio_name,
      latest_date: p.last_history_date,
      latest_value_sek: p.latest_value_sek,
      return_20d: latest_contract.return_20d,
      return_65d: latest_contract.return_65d,
      return_200d: latest_contract.return_200d,
      return_20d_valid: p.return_20d_valid,
      return_65d_valid: p.return_65d_valid,
      return_200d_valid: p.return_200d_valid,
      invalid_reason_20d: p.invalid_reason_20d,
      invalid_reason_65d: p.invalid_reason_65d,
      invalid_reason_200d: p.invalid_reason_200d,
      composition_changed_20d: p.composition_changed_20d,
      composition_changed_65d: p.composition_changed_65d,
      composition_changed_200d: p.composition_changed_200d,
      short_direction: latest_contract.short_direction,
      medium_direction: latest_contract.medium_direction,
      long_direction: latest_contract.long_direction,
      trend_status: latest_contract.trend_status,
      trend_completeness: latest_contract.trend_completeness,
      data_quality: p.data_quality,
      consistency_hash: p.consistency_hash,
      serialization_contract_error: latest_contract.contract_error,
      serialization_contract_reason: latest_contract.contract_reason,
    }));

    const mismatches = portfolios.flatMap((p) => {
      const trace = canonical.portfolios.find((x) => x.portfolio_id === p.portfolio_id);
      if (!trace) return [`missing_trace:${p.portfolio_id}`];
      const reasons: string[] = [];
      if (p.latest_value_sek !== trace.latest_value_sek) reasons.push("latest_value_mismatch");
      if (p.return_65d !== trace.return_65d) reasons.push("return_65d_mismatch");
      if (p.trend_completeness !== trace.trend_completeness) reasons.push("trend_completeness_mismatch");
      if (p.serialization_contract_error) reasons.push(`serialization_contract_error:${p.serialization_contract_reason ?? "unknown"}`);
      return reasons.map((r) => `${p.portfolio_id}:${r}`);
    });

    const traceStageStarted = Date.now();
    pushStage("trace/debug_build_started", traceStageStarted, true);
    const diagnosticsPayload = debug
      ? {
        canonical,
        mismatch_flag: mismatches.length > 0,
        mismatch_reasons: mismatches,
        latest_trace_match: mismatches.length === 0,
        latest_card_match: null,
        ui_value_match: null,
        portfolios: portfolioDiagnostics.map(({ portfolio_id, canonical: p, latest_contract }) => ({
          portfolio_id,
          invalid_reason_20d: p.invalid_reason_20d,
          invalid_reason_65d: p.invalid_reason_65d,
          invalid_reason_200d: p.invalid_reason_200d,
          composition_changed_20d: p.composition_changed_20d,
          composition_changed_65d: p.composition_changed_65d,
          composition_changed_200d: p.composition_changed_200d,
          return_20d: latest_contract.return_20d,
          return_65d: latest_contract.return_65d,
          return_200d: latest_contract.return_200d,
          trend_completeness: latest_contract.trend_completeness,
          short_direction: latest_contract.short_direction,
          medium_direction: latest_contract.medium_direction,
          long_direction: latest_contract.long_direction,
          serialization_contract_error: latest_contract.contract_error,
          serialization_contract_reason: latest_contract.contract_reason,
          contract_debug: {
            canonical_row_exists: true,
            latest_row_exists: true,
            overview_row_exists: null,
            ui_row_exists: null,
            canonical_market_value: p.latest_value_sek,
            latest_market_value: p.latest_value_sek,
            overview_market_value: null,
            ui_market_value: null,
            canonical_return_20d: p.return_20d,
            latest_return_20d: latest_contract.return_20d,
            overview_return_20d: null,
            ui_return_20d: null,
            canonical_return_65d: p.return_65d,
            latest_return_65d: latest_contract.return_65d,
            overview_return_65d: null,
            ui_return_65d: null,
            canonical_return_200d: p.return_200d,
            latest_return_200d: latest_contract.return_200d,
            overview_return_200d: null,
            ui_return_200d: null,
            canonical_trend_completeness: p.trend_completeness,
            latest_trend_completeness: latest_contract.trend_completeness,
            overview_trend_completeness: null,
            ui_trend_completeness: null,
            canonical_short_direction: p.short_direction,
            latest_short_direction: latest_contract.short_direction,
            overview_short_direction: null,
            ui_short_direction: null,
            canonical_medium_direction: p.medium_direction,
            latest_medium_direction: latest_contract.medium_direction,
            overview_medium_direction: null,
            ui_medium_direction: null,
            canonical_long_direction: p.long_direction,
            latest_long_direction: latest_contract.long_direction,
            overview_long_direction: null,
            ui_long_direction: null,
            canonical_trend_status: p.trend_status,
            latest_trend_status: latest_contract.trend_status,
            overview_trend_status: null,
            ui_trend_status: null,
            canonical_as_of_date: p.as_of_date,
            latest_as_of_date: p.as_of_date,
            overview_as_of_date: null,
            ui_as_of_date: null,
            contract_match_market_value: p.latest_value_sek === p.latest_value_sek,
            contract_match_returns: p.return_20d === latest_contract.return_20d
              && p.return_65d === latest_contract.return_65d
              && p.return_200d === latest_contract.return_200d,
            contract_match_directions: p.short_direction === latest_contract.short_direction
              && p.medium_direction === latest_contract.medium_direction
              && p.long_direction === latest_contract.long_direction,
            contract_match_status: p.trend_status === latest_contract.trend_status,
            contract_match_completeness: p.trend_completeness === latest_contract.trend_completeness,
            contract_match_dates: p.as_of_date === p.as_of_date,
            contract_match_canonical_to_latest:
              p.return_20d === latest_contract.return_20d
              && p.return_65d === latest_contract.return_65d
              && p.return_200d === latest_contract.return_200d
              && p.trend_completeness === latest_contract.trend_completeness
              && p.short_direction === latest_contract.short_direction
              && p.medium_direction === latest_contract.medium_direction
              && p.long_direction === latest_contract.long_direction,
            contract_match_latest_to_adapter: null,
            contract_match_adapter_to_ui: null,
            mismatch_stage: latest_contract.contract_error ? "latest" : "none",
            mismatch_reason: latest_contract.contract_reason ?? "none",
          },
        })),
      }
      : null;
    pushStage("trace/debug_build_finished", traceStageStarted, true);

    const serializeStarted = Date.now();
    pushStage("response_serialize_started", serializeStarted, true);
    const payload: any = {
      ok: true,
      did_timeout: false,
      last_completed_stage: "response_serialize_started",
      did_engine_finish_all_stages: false,
      canonical_source_version: canonical.canonical_source_version,
      date_rule: canonical.date_rule,
      continuity_rule: canonical.continuity_rule,
      total_aggregation_rule: canonical.total_aggregation_rule,
      portfolios,
      total: canonical.total,
    };
    if (debug && diagnosticsPayload) payload.diagnostics = diagnosticsPayload;
    const serializeDurationMs = Date.now() - serializeStarted;
    payload.runtime_audit = {
      runtime_stage_trace: routeTrace,
      total_runtime_ms: Date.now() - routeStart,
      last_completed_stage: lastCompletedStage ?? canonical.runtime_audit?.last_completed_stage ?? null,
      timed_out_stage: null,
      did_timeout: false,
      did_engine_finish_all_stages: false,
      portfolios_loaded_count: canonical.runtime_audit?.portfolios_loaded_count ?? canonical.portfolios.length,
      positions_loaded_count: canonical.runtime_audit?.positions_loaded_count ?? null,
      history_row_count: canonical.runtime_audit?.history_row_count ?? null,
      fx_row_count: canonical.runtime_audit?.fx_row_count ?? null,
      series_days_count: canonical.runtime_audit?.series_days_count ?? null,
      response_payload_size_proxy: JSON.stringify({ portfolios: payload.portfolios?.length ?? 0, diagnostics: debug }).length,
      scope_flags_used: canonical.runtime_audit?.scope_flags_used ?? canonicalAuditFlags,
      compute_time_ms: canonical.runtime_audit?.compute_time_ms ?? null,
      serialization_time_ms: serializeDurationMs,
      operations_count: canonical.runtime_audit?.operations_count ?? null,
      rows_processed: canonical.runtime_audit?.rows_processed ?? null,
      portfolios_processed: canonical.runtime_audit?.portfolios_processed ?? null,
      days_processed: canonical.runtime_audit?.days_processed ?? null,
      work_units_estimate: canonical.runtime_audit?.work_units_estimate ?? null,
    };
    pushStage("response_serialize_finished", serializeStarted, true);
    payload.runtime_audit.did_engine_finish_all_stages = true;
    payload.runtime_audit.last_completed_stage = "response_serialize_finished";
    payload.last_completed_stage = "response_serialize_finished";
    payload.did_engine_finish_all_stages = true;

    if (runMatrix) {
      const cases: Array<{ case: string; options: any; portfolios: string; days: string }> = [
        { case: "CASE_1", options: { portfolio_id: "portf0", limit_days: 30, skip_total: true, compact_mode: true }, portfolios: "1", days: "30" },
        { case: "CASE_2", options: { portfolio_id: "portf0", skip_total: true, compact_mode: true }, portfolios: "1", days: "full" },
        { case: "CASE_3", options: { compact_mode: true, skip_trace: true, skip_db_evidence: true }, portfolios: "all", days: "full" },
        { case: "CASE_4", options: {}, portfolios: "all", days: "full" },
        { case: "CASE_5", options: { skip_total: true, compact_mode: true }, portfolios: "all", days: "full" },
      ];
      const results: Array<any> = [];
      for (const item of cases) {
        const started = Date.now();
        try {
          const r = await readPortfolioHistoryCanonicalLatest({ ...item.options, max_runtime_ms: canonicalAuditFlags.max_runtime_ms ?? null });
          const correctness = r.portfolios.every((p) =>
            p.trend_completeness !== "full"
            || (isFiniteNumber(p.return_20d) && isFiniteNumber(p.return_65d) && isFiniteNumber(p.return_200d)))
            ? "valid"
            : "invalid";
          results.push({
            case: item.case,
            portfolios: item.portfolios,
            days: item.days,
            success: true,
            timeout: false,
            total_runtime_ms: Date.now() - started,
            correctness,
          });
        } catch (matrixError) {
          const timeout = matrixError instanceof CanonicalBuildTimeoutError;
          results.push({
            case: item.case,
            portfolios: item.portfolios,
            days: item.days,
            success: false,
            timeout,
            total_runtime_ms: Date.now() - started,
            correctness: "invalid",
          });
        }
      }
      payload.runtime_vs_logic_table = results;
    }
    res.status(200).json(payload);
  } catch (error) {
    if (error instanceof CanonicalBuildTimeoutError) {
      const partial = error.partial_bundle;
      res.status(200).json({
        ok: false,
        error: error.message,
        did_timeout: true,
        last_completed_stage: partial.runtime_audit?.last_completed_stage ?? lastCompletedStage,
        did_engine_finish_all_stages: false,
        canonical_source_version: partial.canonical_source_version,
        portfolios: partial.portfolios,
        total: partial.total,
        partial_snapshot: {
          canonical_series: partial.portfolios.map((p) => ({ portfolio_id: p.portfolio_id, daily_series: p.daily_series })),
          computed_returns: partial.portfolios.map((p) => ({
            portfolio_id: p.portfolio_id,
            return_20d: p.return_20d,
            return_65d: p.return_65d,
            return_200d: p.return_200d,
          })),
          counts: {
            portfolios_loaded_count: partial.runtime_audit?.portfolios_loaded_count ?? partial.portfolios.length,
            positions_loaded_count: partial.runtime_audit?.positions_loaded_count ?? null,
            history_row_count: partial.runtime_audit?.history_row_count ?? null,
            fx_row_count: partial.runtime_audit?.fx_row_count ?? null,
            series_days_count: partial.runtime_audit?.series_days_count ?? null,
          },
        },
        runtime_audit: {
          ...partial.runtime_audit,
          runtime_stage_trace: routeTrace.concat(partial.runtime_audit?.runtime_stage_trace ?? []),
          total_runtime_ms: Date.now() - routeStart,
          timed_out_stage: partial.runtime_audit?.timed_out_stage ?? partial.runtime_audit?.last_completed_stage ?? null,
        },
      });
      return;
    }
    res.status(500).json({
      ok: false,
      error: (error as Error).message,
      runtime_audit: {
        runtime_stage_trace: routeTrace,
        total_runtime_ms: Date.now() - routeStart,
        last_completed_stage: lastCompletedStage,
        timed_out_stage: String((error as Error).message ?? "").includes("timeout") ? lastCompletedStage : null,
        did_timeout: String((error as Error).message ?? "").includes("timeout"),
        did_engine_finish_all_stages: false,
      },
    });
  }
}
