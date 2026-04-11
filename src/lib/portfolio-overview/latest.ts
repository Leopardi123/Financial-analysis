import { query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { loadPortfolioConfigSourceOfTruth } from "../portfolio-admin/repository.js";
import { buildPerPortfolioValidationIssues, validateGlobalTargetWeight } from "../portfolio-admin/validation.js";
import { getLatestPortfolioRisk } from "../portfolio-risk/build.js";
import { getLatestPortfolioHedgeAndDryPowder } from "../portfolio-hedge/build.js";
import { readPortfolioHistoryCanonicalMaterializedLatest } from "../portfolio-history/canonical.js";
import { normalizePortfolioTrendContract } from "../portfolio-history/contract.js";
import { computeTrendMetricsFromSeries } from "../portfolio-history/metrics.js";

const REBUILT_HISTORY_SOURCES = new Set(["positions_price_history", "positions_snapshots", "snapshots", "unavailable"]);
const TOTAL_INCLUSION_FALLBACK_MAX_AGE_DAYS = 30;

export type PortfolioOverviewTraceRow = {
  stage: string;
  ok: boolean;
  duration_ms: number;
  started_at: string;
  error?: string;
};

export type PortfolioOverviewTraceRecorder = {
  runStage: <T>(stage: string, fn: () => Promise<T>) => Promise<T>;
};

function asNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asNullableFiniteNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function tableHasRows(tableName: string): Promise<boolean> {
  try {
    const rows = await query(`SELECT 1 AS x FROM ${tableName} LIMIT 1`);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await query(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [tableName]);
  return rows.length > 0;
}

function parseJson(value: unknown): any | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeTrendReturn(value: unknown): number | null {
  const num = asNullableFiniteNum(value);
  return num;
}

function normalizeAdapterTrendContract(trend: {
  return_20d: number | null;
  return_65d: number | null;
  return_200d: number | null;
  short_direction: string;
  medium_direction: string;
  long_direction: string;
  trend_status: string;
  signal_completeness: string | null;
  relative_strength_bucket?: string | null;
  [key: string]: unknown;
}) {
  const normalized = normalizePortfolioTrendContract({
    return_20d: trend.return_20d,
    return_65d: trend.return_65d,
    return_200d: trend.return_200d,
    trend_completeness: trend.signal_completeness,
    short_direction: trend.short_direction,
    medium_direction: trend.medium_direction,
    long_direction: trend.long_direction,
    trend_status: trend.trend_status,
  });
  return {
    ...trend,
    return_20d: normalized.return_20d,
    return_65d: normalized.return_65d,
    return_200d: normalized.return_200d,
    signal_completeness: normalized.trend_completeness,
    short_direction: normalized.short_direction,
    medium_direction: normalized.medium_direction,
    long_direction: normalized.long_direction,
    trend_status: normalized.trend_status,
    adapter_contract_error: normalized.contract_error,
    adapter_contract_reason: normalized.contract_reason,
  };
}

function windowKeyToDays(window: "20d" | "65d" | "200d"): 20 | 65 | 200 {
  if (window === "20d") return 20;
  if (window === "65d") return 65;
  return 200;
}

function formatUiPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `${value.toFixed(2)}%`;
}

function classifyDisplay(rawReturn: number | null, uiDisplay: string): "legitimate_numeric" | "rounded_to_zero" | "null_coerced_to_zero" | "fallback_placeholder" | "legitimate_exact_zero" {
  if (uiDisplay === "Unavailable") return "fallback_placeholder";
  if (uiDisplay === "0.00%") {
    if (rawReturn === null || !Number.isFinite(rawReturn)) return "null_coerced_to_zero";
    if (rawReturn === 0) return "legitimate_exact_zero";
    return "rounded_to_zero";
  }
  return "legitimate_numeric";
}

function buildStructuredUnavailableTrendDebug(row: any) {
  const availableDaysRaw = Number(row?.available_days ?? NaN);
  const availableDays = Number.isFinite(availableDaysRaw) ? availableDaysRaw : 0;
  const trendCompleteness = availableDays >= 200 ? "full" : availableDays >= 65 ? "partial" : "unavailable";
  return {
    attempted: true,
    available_days: availableDays,
    return_20d: sanitizeTrendReturn(row?.return_20d),
    return_65d: sanitizeTrendReturn(row?.return_65d),
    return_200d: sanitizeTrendReturn(row?.return_200d),
    short_direction: row?.short_direction == null ? "unavailable" : String(row.short_direction),
    medium_direction: row?.medium_direction == null ? "unavailable" : String(row.medium_direction),
    long_direction: row?.long_direction == null ? "unavailable" : String(row.long_direction),
    trend_status: row?.trend_status == null ? "unavailable" : String(row.trend_status),
    trend_completeness: trendCompleteness,
    reason: availableDays < 65 ? "insufficient_history" : "trend_debug_unavailable",
  };
}

function normalizeTrendFields(row: any) {
  const trendStatus = row?.trend_status == null ? "unavailable" : String(row.trend_status);
  const shortDirection = row?.short_direction == null ? "unavailable" : String(row.short_direction);
  const mediumDirection = row?.medium_direction == null ? "unavailable" : String(row.medium_direction);
  const longDirection = row?.long_direction == null ? "unavailable" : String(row.long_direction);
  const return20d = asNullableFiniteNum(row?.return_20d);
  const return65d = asNullableFiniteNum(row?.return_65d);
  const return200d = asNullableFiniteNum(row?.return_200d);
  const looksLikePlaceholder = trendStatus === "unavailable"
    && shortDirection === "unavailable"
    && mediumDirection === "unavailable"
    && longDirection === "unavailable"
    && return20d === 0
    && return65d === 0
    && return200d === 0;
  return {
    return_20d: looksLikePlaceholder ? null : return20d,
    return_65d: looksLikePlaceholder ? null : return65d,
    return_200d: looksLikePlaceholder ? null : return200d,
    short_direction: shortDirection,
    medium_direction: mediumDirection,
    long_direction: longDirection,
    trend_status: trendStatus,
    relative_strength_bucket: row?.relative_strength_bucket == null ? null : String(row.relative_strength_bucket),
    signal_completeness: row?.signal_completeness == null ? null : String(row.signal_completeness),
  };
}

function dateToUtcMs(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function compareDatesAsc(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function computeAllocationPlanStatus(rows: any[]): "within_allocation_plan" | "outside_allocation_plan" | "materially_outside_allocation_plan" {
  const statuses = rows
    .filter((row) => Number(row.active ?? 0) === 1 && Number(row.included_in_total_portfolio ?? 0) === 1)
    .map((row) => String(row.weight_status ?? "unavailable"));

  if (statuses.some((status) => status === "critical_underweight" || status === "critical_overweight")) {
    return "materially_outside_allocation_plan";
  }
  if (statuses.some((status) => status === "underweight" || status === "overweight" || status === "unavailable")) {
    return "outside_allocation_plan";
  }
  return "within_allocation_plan";
}

function computeDrawdownConcentration(rows: any[]): boolean | null {
  const included = rows.filter((row) => Number(row.active ?? 0) === 1 && Number(row.included_in_total_portfolio ?? 0) === 1);
  const contributions = included
    .map((row) => {
      const weight = asNum(row.actual_weight_pct) ?? 0;
      const drawdown = asNum(row.current_drawdown_pct);
      if (drawdown === null) return 0;
      return Math.abs(drawdown) * weight;
    });

  const total = contributions.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const max = Math.max(...contributions);
  return (max / total) > 0.5;
}

function computeExcessiveJuniorExposure(rows: any[]): boolean | null {
  const junior = rows.find((row) => String(row.portfolio_type ?? "") === "commodity_junior" && Number(row.active ?? 0) === 1 && Number(row.included_in_total_portfolio ?? 0) === 1);
  if (!junior) return null;

  const actual = asNum(junior.actual_weight_pct);
  const max = asNum(junior.max_weight_pct);
  if (actual === null) return null;
  if (max !== null && actual > max) return true;
  return actual > 15;
}

function computeExcessiveCommodityCyclicality(rows: any[], totalRiskStatus: string | null): boolean | null {
  const included = rows.filter((row) => Number(row.active ?? 0) === 1 && Number(row.included_in_total_portfolio ?? 0) === 1);
  if (included.length === 0) return null;

  const commodityWeight = included
    .filter((row) => ["commodity_majors", "commodity_junior"].includes(String(row.portfolio_type ?? "")))
    .reduce((sum, row) => sum + (asNum(row.actual_weight_pct) ?? 0), 0);

  if (!["high", "critical"].includes(String(totalRiskStatus ?? ""))) {
    return false;
  }

  return commodityWeight > 40;
}

function buildDataQualityFlags(row: any) {
  return {
    weight_unavailable: String(row.weight_status ?? "") === "unavailable",
    trend_unavailable: String(row.trend_status ?? "") === "unavailable" || row.return_65d == null,
    risk_unavailable: String(row.risk_status ?? "") === "unavailable",
    hedge_unavailable: String(row.hedge_status ?? "") === "insufficient_data_for_hedge_signal",
    partial_signal: String(row.signal_completeness ?? "") === "partial",
  };
}

function buildCompositionHash(source: string, portfolioId: string, asOfDate: string | null): string | null {
  if (!source || !portfolioId || !asOfDate) return null;
  return `${source}:${portfolioId}:${asOfDate}`;
}

function approximatelyEqual(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return false;
  return Math.abs(left - right) < 1e-6;
}

type WarningDetail = {
  code: string;
  title: string;
  detail: string;
  severity: "warning" | "critical";
  portfolio_id?: string;
};

export async function getPortfolioOverviewLatest(debug: boolean, trace?: PortfolioOverviewTraceRecorder) {
  const runStage = async <T>(stage: string, fn: () => Promise<T>) => {
    if (!trace) return fn();
    return trace.runStage(stage, fn);
  };

  const latestRows = await runStage("snapshots_loaded", async () =>
    query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`)
  );
  const asOfDate = String(latestRows[0]?.as_of_date ?? "").trim() || null;

  const configSource = await runStage("admin_config_loaded", async () => loadPortfolioConfigSourceOfTruth());
  const adminConfigs = configSource.portfolios;
  const globalValidation = validateGlobalTargetWeight(adminConfigs);
  const validationById = new Map(buildPerPortfolioValidationIssues(adminConfigs).map((item) => [item.portfolio_id, item]));

  const riskPayload = await runStage("risk_loaded", async () => getLatestPortfolioRisk());
  const hedgePayload = await runStage("hedge_loaded", async () => getLatestPortfolioHedgeAndDryPowder());
  const canonicalLatest = await runStage("canonical_history_materialized_loaded", async () => readPortfolioHistoryCanonicalMaterializedLatest());
  const canonicalByPortfolioId = new Map(canonicalLatest.portfolios.map((item) => [item.portfolio_id, item]));

  const portfolioRows = asOfDate
    ? await runStage("snapshots_loaded", async () =>
      query(
        `SELECT s.*, a.portfolio_name, a.portfolio_type, a.sort_order, a.active, a.visible_in_overview, a.included_in_total_portfolio
         FROM ${tables.portfolioSnapshots} s
         LEFT JOIN ${tables.portfolioAdminConfig} a ON a.portfolio_id = s.portfolio_id
         WHERE s.as_of_date = ? AND COALESCE(a.visible_in_overview, 1) = 1
         ORDER BY a.sort_order ASC, s.portfolio_id ASC`,
        [asOfDate]
      ))
    : [];

  const historyTrendRows = asOfDate
    ? await runStage("history_trend_loaded", async () => query(
      `SELECT portfolio_id, as_of_date, market_value, data_source
       FROM ${tables.portfolioHistoryDaily}
       WHERE market_value IS NOT NULL
       ORDER BY portfolio_id ASC, as_of_date ASC`
    ))
    : [];
  const seriesByPortfolioRaw = new Map<string, Array<{ as_of_date: string; market_value: number; data_source: string | null }>>();
  for (const row of historyTrendRows as any[]) {
    const portfolioId = String(row.portfolio_id ?? "");
    const marketValue = Number(row.market_value ?? NaN);
    const asOfDate = String(row.as_of_date ?? "").trim();
    const dataSource = String(row.data_source ?? "").trim() || null;
    if (!portfolioId || !Number.isFinite(marketValue) || marketValue <= 0 || !isValidDate(asOfDate)) continue;
    const bucket = seriesByPortfolioRaw.get(portfolioId) ?? [];
    bucket.push({ as_of_date: asOfDate, market_value: marketValue, data_source: dataSource });
    seriesByPortfolioRaw.set(portfolioId, bucket);
  }
  for (const rows of seriesByPortfolioRaw.values()) {
    rows.sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
  }
  const seriesByPortfolio = new Map<string, Array<{ as_of_date: string; market_value: number }>>();
  for (const [portfolioId, rows] of seriesByPortfolioRaw.entries()) {
    const rebuiltRows = rows.filter((row) => row.data_source !== null && REBUILT_HISTORY_SOURCES.has(row.data_source));
    const legacyRows = rows.filter((row) => !(row.data_source !== null && REBUILT_HISTORY_SOURCES.has(row.data_source)));
    const rebuiltLatest = rebuiltRows[rebuiltRows.length - 1] ?? null;
    const legacyLatest = legacyRows[legacyRows.length - 1] ?? null;
    const selectedRows = (() => {
      if (rebuiltRows.length === 0 && legacyRows.length === 0) return [] as typeof rows;
      if (rebuiltRows.length === 0) return legacyRows;
      if (legacyRows.length === 0) return rebuiltRows;
      return compareDatesAsc(rebuiltLatest?.as_of_date ?? null, legacyLatest?.as_of_date ?? null) >= 0
        ? rebuiltRows
        : legacyRows;
    })();
    seriesByPortfolio.set(portfolioId, selectedRows.map((row) => ({ as_of_date: row.as_of_date, market_value: row.market_value })));
  }
  const historyTrendByPortfolioId = new Map<string, { metrics: ReturnType<typeof normalizeTrendFields> & { signal_completeness: string | null }; trend_debug: any }>();
  for (const [portfolioId, canonical] of canonicalByPortfolioId.entries()) {
    const metrics = normalizeTrendFields({
      return_20d: canonical.return_20d,
      return_65d: canonical.return_65d,
      return_200d: canonical.return_200d,
      short_direction: canonical.short_direction,
      medium_direction: canonical.medium_direction,
      long_direction: canonical.long_direction,
      trend_status: canonical.trend_status,
      signal_completeness: canonical.trend_completeness,
    });
    historyTrendByPortfolioId.set(portfolioId, {
      metrics: {
        ...metrics,
        signal_completeness: canonical.trend_completeness,
      },
      trend_debug: {
        attempted: true,
        available_days: canonical.daily_series.length,
        first_history_date: canonical.first_history_date,
        last_history_date: canonical.last_history_date,
        latest_date: canonical.last_history_date,
        latest_value_sek: canonical.latest_value_sek,
        return_20d: canonical.return_20d,
        return_65d: canonical.return_65d,
        return_200d: canonical.return_200d,
        anchor_20d_date: canonical.anchor_20d_date,
        anchor_65d_date: canonical.anchor_65d_date,
        anchor_200d_date: canonical.anchor_200d_date,
        anchor_20d_value_sek: canonical.anchor_20d_value_sek,
        anchor_65d_value_sek: canonical.anchor_65d_value_sek,
        anchor_200d_value_sek: canonical.anchor_200d_value_sek,
        return_20d_valid: canonical.return_20d_valid,
        return_65d_valid: canonical.return_65d_valid,
        return_200d_valid: canonical.return_200d_valid,
        invalid_reason_20d: canonical.invalid_reason_20d,
        invalid_reason_65d: canonical.invalid_reason_65d,
        invalid_reason_200d: canonical.invalid_reason_200d,
        composition_changed_20d: canonical.composition_changed_20d,
        composition_changed_65d: canonical.composition_changed_65d,
        composition_changed_200d: canonical.composition_changed_200d,
        short_direction: canonical.short_direction,
        medium_direction: canonical.medium_direction,
        long_direction: canonical.long_direction,
        trend_status: canonical.trend_status,
        trend_completeness: canonical.trend_completeness,
      },
    });
  }

  const includedConfigIds = adminConfigs
    .filter((row) => row.active && row.included_in_total_portfolio)
    .map((row) => row.portfolio_id);
  const includedHistoryRows = includedConfigIds.flatMap((portfolioId) =>
    (seriesByPortfolio.get(portfolioId) ?? []).map((row) => ({
      portfolio_id: portfolioId,
      as_of_date: row.as_of_date,
      market_value: row.market_value,
    }))
  );
  const newestIncludedDateMs = includedHistoryRows
    .map((row) => dateToUtcMs(row.as_of_date))
    .filter((value): value is number => value !== null)
    .reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY);
  const recentCutoffMs = Number.isFinite(newestIncludedDateMs) ? newestIncludedDateMs - (30 * 24 * 60 * 60 * 1000) : null;
  const contributorsByDate = new Map<string, Set<string>>();
  const valueByPortfolioDate = new Map<string, number>();
  for (const row of includedHistoryRows) {
    const key = `${row.portfolio_id}__${row.as_of_date}`;
    valueByPortfolioDate.set(key, row.market_value);
    const bucket = contributorsByDate.get(row.as_of_date) ?? new Set<string>();
    bucket.add(row.portfolio_id);
    contributorsByDate.set(row.as_of_date, bucket);
  }
  const dateCandidates = Array.from(contributorsByDate.entries())
    .filter(([date]) => {
      if (recentCutoffMs === null) return true;
      const ms = dateToUtcMs(date);
      return ms !== null && ms >= recentCutoffMs;
    });
  const scoredCandidates = (dateCandidates.length > 0 ? dateCandidates : Array.from(contributorsByDate.entries()))
    .map(([date, ids]) => ({ date, contributor_count: ids.size }))
    .sort((a, b) => {
      if (b.contributor_count !== a.contributor_count) return b.contributor_count - a.contributor_count;
      return b.date.localeCompare(a.date);
    });
  const latestTotalHistoryDate = canonicalLatest.total.as_of_date ?? scoredCandidates[0]?.date ?? "";
  const totalDateMs = dateToUtcMs(latestTotalHistoryDate);
  const perPortfolioTotalInclusion = includedConfigIds.map((portfolioId) => {
    const series = seriesByPortfolio.get(portfolioId) ?? [];
    const latestSeriesRow = series[series.length - 1] ?? null;
    const exactDateRow = series.find((row) => row.as_of_date === latestTotalHistoryDate) ?? null;
    const fallbackCandidates = series
      .filter((row) => row.as_of_date <= latestTotalHistoryDate)
      .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
    const fallbackRow = fallbackCandidates[fallbackCandidates.length - 1] ?? null;
    const marketValueCandidate = asNullableFiniteNum(exactDateRow?.market_value ?? fallbackRow?.market_value ?? null);
    const marketValueFinite = marketValueCandidate !== null && Number.isFinite(marketValueCandidate);
    const marketValuePositive = marketValueFinite && marketValueCandidate > 0;
    const exactDateMatch = Boolean(exactDateRow);
    const fallbackAllowed = true;
    const fallbackDateUsed = exactDateMatch ? null : (fallbackRow?.as_of_date ?? null);
    const fallbackDateMs = fallbackDateUsed ? dateToUtcMs(fallbackDateUsed) : null;
    const fallbackAgeDays = (totalDateMs !== null && fallbackDateMs !== null)
      ? Math.max(0, Math.floor((totalDateMs - fallbackDateMs) / (24 * 60 * 60 * 1000)))
      : null;
    const fallbackAgeAccepted = fallbackAgeDays === null ? false : fallbackAgeDays <= TOTAL_INCLUSION_FALLBACK_MAX_AGE_DAYS;
    const passesTotalDateRule = exactDateMatch || (fallbackAllowed && fallbackRow !== null && fallbackAgeAccepted);
    const passesQualityRule = marketValuePositive;
    const passesInclusionRule = passesTotalDateRule && passesQualityRule;
    const excludedReason = !passesTotalDateRule
      ? (fallbackRow ? "fallback_date_too_old" : "missing_row_on_or_before_total_date")
      : !passesQualityRule
        ? (marketValueCandidate === null ? "market_value_missing_or_non_finite" : "market_value_non_positive")
        : "included";
    const excludedStage = !passesTotalDateRule
      ? "total_date_rule"
      : !passesQualityRule
        ? "market_value_rule"
        : "included";
    return {
      portfolio_id: portfolioId,
      candidate_for_total: true,
      included_in_total: passesInclusionRule,
      excluded_reason_exact: excludedReason,
      excluded_stage_exact: excludedStage,
      total_date_used: latestTotalHistoryDate || null,
      portfolio_latest_available_date: latestSeriesRow?.as_of_date ?? null,
      portfolio_canonical_as_of_date: canonicalByPortfolioId.get(portfolioId)?.as_of_date ?? null,
      portfolio_latest_as_of_date: latestSeriesRow?.as_of_date ?? null,
      portfolio_overview_as_of_date: asOfDate,
      market_value_used_for_total: passesInclusionRule ? marketValueCandidate : null,
      market_value_rejected_reason: passesQualityRule ? null : excludedReason,
      trend_required_for_total: false,
      date_match_required_for_total: true,
      exact_date_match_result: exactDateMatch,
      fallback_date_allowed: fallbackAllowed,
      fallback_date_used: fallbackDateUsed,
      null_finite_checks_used: {
        has_market_value: marketValueCandidate !== null,
        market_value_finite: marketValueFinite,
        market_value_positive: marketValuePositive,
      },
      boolean_chain: {
        has_market_value: marketValueCandidate !== null,
        market_value_finite: marketValueFinite,
        has_row_on_total_date: exactDateMatch,
        passes_total_date_rule: passesTotalDateRule,
        passes_quality_rule: passesQualityRule,
        passes_inclusion_rule: passesInclusionRule,
        final_included: passesInclusionRule,
      },
    };
  });
  const contributingPortfolioIds = perPortfolioTotalInclusion
    .filter((item) => item.included_in_total)
    .map((item) => item.portfolio_id)
    .sort((a, b) => a.localeCompare(b));
  const totalHistoryCountRows = await query(`SELECT COUNT(*) AS count FROM ${tables.totalPortfolioHistoryDaily}`);
  const historyAvailableDays = Number(totalHistoryCountRows[0]?.count ?? 0);
  const snapshotCountRows = await query(`SELECT COUNT(*) AS count FROM ${tables.portfolioSnapshots}`);
  const snapshotRowsCount = Number(snapshotCountRows[0]?.count ?? 0);
  const snapshotExists = snapshotRowsCount > 0;
  const historyExists = historyAvailableDays > 0;
  const positionsCountRows = await query(`SELECT COUNT(*) AS count FROM ${tables.portfolioPositions} WHERE active_position = 1`);
  const activePositionsCount = Number(positionsCountRows[0]?.count ?? 0);
  const lastSnapshotBuildRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
  const lastHistoryBuildRows = await query(
    `SELECT last_success_at
     FROM ${tables.portfolioBuildMeta}
     WHERE pipeline_name = 'history'
     LIMIT 1`
  );
  const lastSnapshotBuild = String(lastSnapshotBuildRows[0]?.as_of_date ?? "").trim() || null;
  const lastHistoryBuild = String(lastHistoryBuildRows[0]?.last_success_at ?? "").trim()
    || (latestTotalHistoryDate ? `${latestTotalHistoryDate}T00:00:00.000Z` : null);

  const allocationPlanStatus = computeAllocationPlanStatus(portfolioRows as any[]);
  const included = (portfolioRows as any[]).filter((row) => Number(row.active ?? 0) === 1 && Number(row.included_in_total_portfolio ?? 0) === 1);

  const totalRiskStatus = riskPayload.total.total_risk_status;
  const totalRiskScore = riskPayload.total.total_risk_score;
  const totalHedgeSignal = hedgePayload.total.total_hedge_signal;
  const dryPowderStatus = hedgePayload.total.dry_powder_status;

  const {
    majorWarnings,
    warningDetails,
    drawdownConcentration,
    excessiveJuniorExposure,
    excessiveCommodityCyclicality,
  } = await runStage("warnings_derived", async () => {
    const majorWarningsInner: string[] = [];
    const warningDetailsInner: WarningDetail[] = [];
    const pushWarning = (warning: WarningDetail) => {
      if (majorWarningsInner.includes(warning.code)) return;
      majorWarningsInner.push(warning.code);
      warningDetailsInner.push(warning);
    };
    if (adminConfigs.length > 0) {
      if (globalValidation.status !== "valid") {
        pushWarning({
          code: "target_weight_sum_warning",
          title: "Target weights do not sum to 100%",
          detail: `Current target sum is ${globalValidation.sum.toFixed(1)}%, deviation ${globalValidation.deviation >= 0 ? "+" : ""}${globalValidation.deviation.toFixed(1)}%.`,
          severity: "warning",
        });
      }
      if (allocationPlanStatus === "outside_allocation_plan" || allocationPlanStatus === "materially_outside_allocation_plan") {
        const offender = included.find((row) => {
          const actual = asNum(row.actual_weight_pct);
          const min = asNum(row.min_weight_pct);
          const max = asNum(row.max_weight_pct);
          return actual !== null && ((min !== null && actual < min) || (max !== null && actual > max));
        });
        if (offender) {
          const actual = asNum(offender.actual_weight_pct) ?? 0;
          const min = asNum(offender.min_weight_pct);
          const max = asNum(offender.max_weight_pct);
          const isUnder = min !== null && actual < min;
          pushWarning({
            code: allocationPlanStatus === "materially_outside_allocation_plan"
              ? "allocation_materially_outside_plan"
              : "allocation_outside_plan",
            title: "Allocation outside plan",
            detail: `${String(offender.portfolio_name ?? offender.portfolio_id)} is ${actual.toFixed(1)}% vs ${isUnder ? `min ${min?.toFixed(1)}%` : `max ${max?.toFixed(1)}%`}.`,
            severity: allocationPlanStatus === "materially_outside_allocation_plan" ? "critical" : "warning",
            portfolio_id: String(offender.portfolio_id ?? ""),
          });
        }
      }
    }
    if (totalRiskStatus === "high") pushWarning({ code: "total_risk_high", title: "Total risk is high", detail: "Portfolio risk status is high.", severity: "warning" });
    if (totalRiskStatus === "critical") pushWarning({ code: "total_risk_critical", title: "Total risk is critical", detail: "Portfolio risk status is critical.", severity: "critical" });
    if (totalHedgeSignal === "hedge_recommended") pushWarning({ code: "hedge_recommended", title: "Hedge recommended", detail: "Current hedge model recommends adding protection.", severity: "warning" });
    if (totalHedgeSignal === "hedge_urgent") pushWarning({ code: "hedge_urgent", title: "Hedge urgent", detail: "Current hedge model flags urgent need for protection.", severity: "critical" });
    if (dryPowderStatus === "insufficient_dry_powder") {
      const oppWeight = asNum(hedgePayload.total.opportunistic_weight_pct);
      const required = asNum(hedgePayload.total.required_min_dry_powder_pct);
      pushWarning({
        code: "insufficient_dry_powder",
        title: "Dry powder below minimum",
        detail: `Opportunistic weight is ${oppWeight?.toFixed(1) ?? "n/a"}% vs required minimum ${required?.toFixed(1) ?? "n/a"}%.`,
        severity: "warning",
      });
    }

    const drawdownConcentrationInner = computeDrawdownConcentration(portfolioRows as any[]);
    const excessiveJuniorExposureInner = computeExcessiveJuniorExposure(portfolioRows as any[]);
    const excessiveCommodityCyclicalityInner = computeExcessiveCommodityCyclicality(portfolioRows as any[], totalRiskStatus);

    if (drawdownConcentrationInner === true) pushWarning({ code: "drawdown_concentration", title: "Drawdown concentration risk", detail: "One portfolio contributes over 50% of total drawdown pressure.", severity: "warning" });
    if (excessiveJuniorExposureInner === true) {
      const junior = included.find((row) => String(row.portfolio_type ?? "") === "commodity_junior");
      pushWarning({
        code: "excessive_junior_exposure",
        title: "Junior exposure above threshold",
        detail: `Junior allocation is ${asNum(junior?.actual_weight_pct)?.toFixed(1) ?? "n/a"}% (max ${asNum(junior?.max_weight_pct)?.toFixed(1) ?? "n/a"}%).`,
        severity: "warning",
        portfolio_id: junior ? String(junior.portfolio_id ?? "") : undefined,
      });
    }
    if (excessiveCommodityCyclicalityInner === true) {
      const commodityWeight = included
        .filter((row) => ["commodity_majors", "commodity_junior"].includes(String(row.portfolio_type ?? "")))
        .reduce((sum, row) => sum + (asNum(row.actual_weight_pct) ?? 0), 0);
      pushWarning({
        code: "excessive_commodity_cyclicality",
        title: "Commodity cyclicality is high",
        detail: `Commodity-linked portfolios are ${commodityWeight.toFixed(1)}% while risk state is ${String(totalRiskStatus ?? "unknown")}.`,
        severity: "warning",
      });
    }

    const unavailableCount = (portfolioRows as any[]).filter((row) => {
      const flags = buildDataQualityFlags(row);
      return flags.weight_unavailable && flags.trend_unavailable && flags.risk_unavailable && flags.hedge_unavailable;
    }).length;
    const partialCount = (portfolioRows as any[]).filter((row) => {
      const flags = buildDataQualityFlags(row);
      return !flags.weight_unavailable || !flags.trend_unavailable || !flags.risk_unavailable || !flags.hedge_unavailable;
    }).length;

    if (unavailableCount > 0 && partialCount > 0) pushWarning({ code: "data_partial", title: "Portfolio data is partial", detail: "Some portfolios have incomplete valuation or signal data.", severity: "warning" });
    if ((portfolioRows as any[]).length === 0 || unavailableCount === (portfolioRows as any[]).length) {
      pushWarning({ code: "data_unavailable", title: "Portfolio data unavailable", detail: "No complete portfolio snapshot data is currently available.", severity: "warning" });
    }
    const unvaluedPortfolio = (portfolioRows as any[]).find((row) => {
      const snapshotDebug = parseJson(row.debug_payload_json);
      return Number(snapshotDebug?.positions_active_count ?? 0) > 0 && Number(snapshotDebug?.positions_valued_count ?? 0) === 0;
    });
    if (unvaluedPortfolio) {
      pushWarning({
        code: "positions_unvalued",
        title: "Portfolio has unvalued positions",
        detail: `${String(unvaluedPortfolio.portfolio_name ?? unvaluedPortfolio.portfolio_id)} has active positions but no resolvable market value.`,
        severity: "warning",
        portfolio_id: String(unvaluedPortfolio.portfolio_id ?? ""),
      });
    }
    const zeroMarketValueWithPositions = (portfolioRows as any[]).find((row) => {
      const snapshotDebug = parseJson(row.debug_payload_json);
      const activeCount = Number(snapshotDebug?.positions_active_count ?? 0);
      const marketValue = asNum(row.market_value) ?? 0;
      return activeCount > 0 && marketValue <= 0;
    });
    if (zeroMarketValueWithPositions) {
      pushWarning({
        code: "positions_with_zero_market_value",
        title: "Positions exist but market value is zero",
        detail: `${String(zeroMarketValueWithPositions.portfolio_name ?? zeroMarketValueWithPositions.portfolio_id)} has active positions but zero portfolio market value.`,
        severity: "critical",
        portfolio_id: String(zeroMarketValueWithPositions.portfolio_id ?? ""),
      });
    }

    return {
      majorWarnings: majorWarningsInner,
      warningDetails: warningDetailsInner,
      drawdownConcentration: drawdownConcentrationInner,
      excessiveJuniorExposure: excessiveJuniorExposureInner,
      excessiveCommodityCyclicality: excessiveCommodityCyclicalityInner,
    };
  });

  const trendBasisByPortfolioId = new Map<string, {
    metrics: ReturnType<typeof normalizeTrendFields> & { signal_completeness: string | null };
    trend_debug: any;
    terminal_value_used_for_returns: number | null;
    terminal_value_source: string;
    displayed_market_value_source: string;
    terminal_value_matches_displayed_market_value: boolean;
    terminal_date_used_for_returns: string | null;
    displayed_as_of_date: string | null;
    terminal_date_matches_displayed_date: boolean;
    terminal_composition_hash: string | null;
    displayed_composition_hash: string | null;
    terminal_composition_matches_displayed: boolean;
    mixed_source_row_detected: boolean;
    mismatch_reason: string | null;
  }>();
  for (const row of (portfolioRows as any[])) {
    const portfolioId = String(row.portfolio_id ?? "");
    if (!portfolioId) continue;
    const canonical = canonicalByPortfolioId.get(portfolioId);
    const canonicalTrendDebug = historyTrendByPortfolioId.get(portfolioId)?.trend_debug ?? null;
    const historySeries = [...(seriesByPortfolio.get(portfolioId) ?? [])].sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
    const displayedMarketValue = asNullableFiniteNum(row.market_value);
    const displayedDate = asOfDate;
    const displayedMarketValueSource = "portfolio_snapshots.market_value";
    const displayedCompositionHash = buildCompositionHash("snapshot_basis", portfolioId, displayedDate);

    const boundedHistorySeries = displayedDate
      ? historySeries.filter((point) => point.as_of_date <= displayedDate)
      : historySeries;
    const seriesForReturns = boundedHistorySeries.map((point) => ({ as_of_date: point.as_of_date, market_value: point.market_value, contributor_count: 1 }));
    if (displayedDate && displayedMarketValue !== null && displayedMarketValue > 0) {
      const existingIdx = seriesForReturns.findIndex((point) => point.as_of_date === displayedDate);
      if (existingIdx >= 0) {
        seriesForReturns[existingIdx] = { ...seriesForReturns[existingIdx], market_value: displayedMarketValue };
      } else {
        seriesForReturns.push({ as_of_date: displayedDate, market_value: displayedMarketValue, contributor_count: 1 });
        seriesForReturns.sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
      }
    }

    const computed = computeTrendMetricsFromSeries(seriesForReturns);
    const computedTrend = normalizeTrendFields({
      return_20d: computed.return_20d_valid ? computed.return_20d : null,
      return_65d: computed.return_65d_valid ? computed.return_65d : null,
      return_200d: computed.return_200d_valid ? computed.return_200d : null,
      short_direction: computed.short_direction,
      medium_direction: computed.medium_direction,
      long_direction: computed.long_direction,
      trend_status: computed.trend_status,
      signal_completeness: computed.trend_completeness,
    });
    const terminalDate = computed.last_history_date;
    const terminalValue = computed.latest_value;
    const terminalValueSource = terminalDate === displayedDate && approximatelyEqual(terminalValue, displayedMarketValue)
      ? "portfolio_snapshots.market_value"
      : "portfolio_history_daily.market_value";
    const terminalCompositionHash = buildCompositionHash(
      terminalValueSource === "portfolio_snapshots.market_value" ? "snapshot_basis" : "history_basis",
      portfolioId,
      terminalDate,
    );
    const terminalValueMatchesDisplayed = approximatelyEqual(terminalValue, displayedMarketValue);
    const terminalDateMatchesDisplayed = terminalDate !== null && displayedDate !== null && terminalDate === displayedDate;
    const terminalCompositionMatchesDisplayed = terminalCompositionHash !== null
      && displayedCompositionHash !== null
      && terminalCompositionHash === displayedCompositionHash;
    const mixedSourceRowDetected = !(terminalValueMatchesDisplayed && terminalDateMatchesDisplayed && terminalCompositionMatchesDisplayed);

    const trendUnavailable = {
      ...computedTrend,
      return_20d: null,
      return_65d: null,
      return_200d: null,
      short_direction: "unavailable",
      medium_direction: "unavailable",
      long_direction: "unavailable",
      trend_status: "unavailable",
      signal_completeness: "unavailable",
    };
    const chosenMetrics = mixedSourceRowDetected ? trendUnavailable : computedTrend;
    trendBasisByPortfolioId.set(portfolioId, {
      metrics: {
        ...chosenMetrics,
        signal_completeness: chosenMetrics.signal_completeness,
      },
      trend_debug: {
        attempted: true,
        available_days: computed.available_days,
        first_history_date: computed.first_history_date,
        last_history_date: computed.last_history_date,
        latest_date: computed.last_history_date,
        latest_value_sek: computed.latest_value,
        history_source: terminalValueSource,
        return_20d: chosenMetrics.return_20d,
        return_65d: chosenMetrics.return_65d,
        return_200d: chosenMetrics.return_200d,
        anchor_20d_date: computed.anchor_20d_date,
        anchor_65d_date: computed.anchor_65d_date,
        anchor_200d_date: computed.anchor_200d_date,
        anchor_20d_value_sek: computed.value_at_20d_anchor,
        anchor_65d_value_sek: computed.value_at_65d_anchor,
        anchor_200d_value_sek: computed.value_at_200d_anchor,
        return_20d_valid: !mixedSourceRowDetected && computed.return_20d_valid,
        return_65d_valid: !mixedSourceRowDetected && computed.return_65d_valid,
        return_200d_valid: !mixedSourceRowDetected && computed.return_200d_valid,
        invalid_reason_20d: mixedSourceRowDetected ? "terminal_value_source_mismatch" : (computed.invalid_reasons_20d[0] ?? null),
        invalid_reason_65d: mixedSourceRowDetected ? "terminal_value_source_mismatch" : (computed.invalid_reasons_65d[0] ?? null),
        invalid_reason_200d: mixedSourceRowDetected ? "terminal_value_source_mismatch" : (computed.invalid_reasons_200d[0] ?? null),
        short_direction: chosenMetrics.short_direction,
        medium_direction: chosenMetrics.medium_direction,
        long_direction: chosenMetrics.long_direction,
        trend_status: chosenMetrics.trend_status,
        trend_completeness: chosenMetrics.signal_completeness,
        canonical_latest_value_sek: canonical?.latest_value_sek ?? null,
        canonical_latest_date: canonical?.last_history_date ?? null,
        canonical_history_source: canonicalTrendDebug?.history_source ?? "materialized_portfolio_history_daily",
      },
      terminal_value_used_for_returns: terminalValue,
      terminal_value_source: terminalValueSource,
      displayed_market_value_source: displayedMarketValueSource,
      terminal_value_matches_displayed_market_value: terminalValueMatchesDisplayed,
      terminal_date_used_for_returns: terminalDate,
      displayed_as_of_date: displayedDate,
      terminal_date_matches_displayed_date: terminalDateMatchesDisplayed,
      terminal_composition_hash: terminalCompositionHash,
      displayed_composition_hash: displayedCompositionHash,
      terminal_composition_matches_displayed: terminalCompositionMatchesDisplayed,
      mixed_source_row_detected: mixedSourceRowDetected,
      mismatch_reason: mixedSourceRowDetected ? "terminal_value_source_mismatch" : null,
    });
  }

  const portfolios = (portfolioRows as any[]).map((row) => {
    const trendSource = trendBasisByPortfolioId.get(String(row.portfolio_id ?? "")) ?? historyTrendByPortfolioId.get(String(row.portfolio_id ?? ""));
    const rawTrendMetrics = trendSource?.metrics ?? normalizeTrendFields(row);
    const trendMetrics = normalizeAdapterTrendContract({
      return_20d: rawTrendMetrics.return_20d,
      return_65d: rawTrendMetrics.return_65d,
      return_200d: rawTrendMetrics.return_200d,
      short_direction: rawTrendMetrics.short_direction,
      medium_direction: rawTrendMetrics.medium_direction,
      long_direction: rawTrendMetrics.long_direction,
      trend_status: rawTrendMetrics.trend_status,
      signal_completeness: rawTrendMetrics.signal_completeness,
    });
    return ({
    ...(function () {
      const snapshotDebug = parseJson(row.debug_payload_json);
      return {
        positions_found_count: asNum(snapshotDebug?.positions_found_count),
        positions_active_count: asNum(snapshotDebug?.positions_active_count),
        positions_valued_count: asNum(snapshotDebug?.positions_valued_count),
        positions_unvalued_count: asNum(snapshotDebug?.positions_unvalued_count),
        valuation_state: snapshotDebug?.valuation_state == null ? null : String(snapshotDebug.valuation_state),
      };
    })(),
    portfolio_id: String(row.portfolio_id ?? ""),
    portfolio_name: String(row.portfolio_name ?? ""),
    portfolio_type: String(row.portfolio_type ?? ""),
    sort_order: Number(row.sort_order ?? 0),
    market_value: asNum(row.market_value),
    actual_weight_pct: asNum(row.actual_weight_pct),
    target_weight_pct: asNum(row.target_weight_pct),
    min_weight_pct: asNum(row.min_weight_pct),
    max_weight_pct: asNum(row.max_weight_pct),
    weight_status: row.weight_status == null ? null : String(row.weight_status),
    rebalance_status: row.rebalance_status == null ? null : String(row.rebalance_status),
    return_20d: trendMetrics.return_20d,
    return_65d: trendMetrics.return_65d,
    return_200d: trendMetrics.return_200d,
    short_direction: trendMetrics.short_direction,
    medium_direction: trendMetrics.medium_direction,
    long_direction: trendMetrics.long_direction,
    trend_status: trendMetrics.trend_status,
    relative_strength_bucket: trendMetrics.relative_strength_bucket,
    annualized_vol_65d: asNum(row.annualized_vol_65d),
    current_drawdown_pct: asNum(row.current_drawdown_pct),
    top_holding_weight_pct: asNum(row.top_holding_weight_pct),
    risk_score: asNum(row.risk_score),
    risk_status: row.risk_status == null ? null : String(row.risk_status),
    risk_mismatch_flag: row.risk_mismatch_flag == null ? null : Number(row.risk_mismatch_flag) === 1,
    hedge_need_score: asNum(row.hedge_need_score),
    hedge_status: row.hedge_status == null ? null : String(row.hedge_status),
    suggested_hedge_type: row.suggested_hedge_type == null ? null : String(row.suggested_hedge_type),
    hedge_policy_applied: row.hedge_policy_applied == null ? null : String(row.hedge_policy_applied),
    signal_completeness: trendMetrics.signal_completeness,
    trend_completeness: trendMetrics.signal_completeness,
    trend_contract_error: trendMetrics.adapter_contract_error,
    trend_contract_reason: trendMetrics.adapter_contract_reason,
    data_quality_flags: buildDataQualityFlags({ ...row, trend_status: trendMetrics.trend_status, return_65d: trendMetrics.return_65d }),
  });
  });
  const snapshotIds = new Set((portfolioRows as any[]).map((row) => String(row.portfolio_id ?? "")).filter((id) => id.length > 0));
  const snapshotMetaById = new Map((portfolioRows as any[]).map((row) => ([
    String(row.portfolio_id ?? ""),
    {
      active: Number(row.active ?? 0) === 1,
      included_in_total_portfolio: Number(row.included_in_total_portfolio ?? 0) === 1,
    },
  ])));
  const valuationPerPortfolio = portfolios.map((row) => {
    const snapshotMeta = snapshotMetaById.get(row.portfolio_id) ?? { active: false, included_in_total_portfolio: false };
    const snapshotMarketValue = asNum(row.market_value);
    const usedForTotal = snapshotMeta.active && snapshotMeta.included_in_total_portfolio && snapshotMarketValue !== null && Number.isFinite(snapshotMarketValue);
    return {
      portfolio_id: row.portfolio_id,
      snapshot_row_exists_for_as_of_date: snapshotIds.has(row.portfolio_id),
      snapshot_market_value: snapshotMarketValue,
      canonical_market_value: canonicalByPortfolioId.get(row.portfolio_id)?.latest_value_sek ?? null,
      market_value_used_by_overview: usedForTotal ? snapshotMarketValue : null,
      date_used_for_market_value: usedForTotal ? asOfDate : null,
      used_for_total: usedForTotal,
      exclusion_reason: usedForTotal ? null : (
        !snapshotMeta.active
          ? "portfolio_inactive"
          : !snapshotMeta.included_in_total_portfolio
            ? "not_included_in_total_portfolio"
            : snapshotMarketValue === null
              ? "snapshot_market_value_missing_or_non_finite"
              : null
      ),
    };
  });
  const valuationIncludedPortfolioIds = valuationPerPortfolio.filter((p) => p.used_for_total).map((p) => p.portfolio_id);
  const valuationTotalMarketValue = valuationPerPortfolio
    .filter((p) => p.used_for_total)
    .reduce((sum, p) => sum + (p.market_value_used_by_overview ?? 0), 0);
  const valuationTotalEqualsSum = Math.abs(
    valuationTotalMarketValue - portfolios
      .filter((row) => valuationIncludedPortfolioIds.includes(row.portfolio_id))
      .reduce((sum, row) => sum + (asNum(row.market_value) ?? 0), 0)
  ) < 1e-6;

  const portfoliosConfiguredCount = adminConfigs.length;
  const portfoliosWithSnapshotsCount = snapshotIds.size;
  const hasAnyPositions = await tableHasRows(tables.portfolioPositions);
  const setupState: "no_config" | "configured_no_data" | "configured_positions_no_snapshot" | "partial" | "live" = portfoliosConfiguredCount === 0
    ? "no_config"
    : portfoliosWithSnapshotsCount === 0
      ? (hasAnyPositions ? "configured_positions_no_snapshot" : "configured_no_data")
      : (majorWarnings.includes("data_partial") || majorWarnings.includes("data_unavailable"))
        ? "partial"
        : "live";

  const basePayload = await runStage("response_assembled", async () => ({
    as_of_date: asOfDate,
    total: {
      market_value: valuationTotalMarketValue,
      allocation_plan_status: allocationPlanStatus,
      total_risk_score: totalRiskScore,
      total_risk_status: totalRiskStatus,
      total_hedge_signal: totalHedgeSignal,
      dry_powder_status: dryPowderStatus,
      opportunistic_weight_pct: hedgePayload.total.opportunistic_weight_pct,
      required_min_dry_powder_pct: hedgePayload.total.required_min_dry_powder_pct,
      included_portfolio_count: valuationIncludedPortfolioIds.length,
      rows_with_terminal_source_mismatch: portfolios.filter((row) => trendBasisByPortfolioId.get(row.portfolio_id)?.mixed_source_row_detected === true).length,
      major_warnings: Array.from(new Set(majorWarnings)),
      major_warning_details: warningDetails,
    },
    performance: {
      daily_return_pct: canonicalLatest.total.daily_return_pct,
      cumulative_return_pct: canonicalLatest.total.cumulative_return_pct,
      drawdown_pct: canonicalLatest.total.drawdown_pct,
      history_available_days: canonicalLatest.total.history_days_available,
      data_quality: canonicalLatest.total.data_quality,
    },
    portfolios,
    setup: {
      setup_state: setupState,
      portfolios_configured_count: portfoliosConfiguredCount,
      portfolios_with_snapshots_count: portfoliosWithSnapshotsCount,
      positions_available: hasAnyPositions,
      history_available_days: historyAvailableDays,
    },
    pipeline_status: {
      snapshot_exists: snapshotExists,
      history_exists: historyExists,
      history_days_available: historyAvailableDays,
      positions_count: activePositionsCount,
      last_snapshot_build: lastSnapshotBuild,
      last_history_build: lastHistoryBuild,
      total_date_used: asOfDate,
      total_date_rule_used: "snapshot_exact_as_of_date",
      contributing_portfolio_ids: valuationIncludedPortfolioIds,
      excluded_portfolio_ids: valuationPerPortfolio.filter((item) => !item.used_for_total).map((item) => item.portfolio_id),
      trend_date_used: latestTotalHistoryDate || null,
      trend_contributing_portfolio_ids: contributingPortfolioIds,
    },
  }));

  if (!debug) return basePayload;

  const debugPayload = {
    config_source_debug: {
      endpoint_name: "/api/portfolio/overview/latest",
      route_file: "src/server/routes/portfolio/overview/latest.ts",
      function_name: configSource.diagnostics.function_name,
      database_url_masked: configSource.diagnostics.database_url_masked,
      source_table_names: configSource.diagnostics.source_table_names,
      exact_query_purpose: configSource.diagnostics.query_purpose,
      rows_found: configSource.diagnostics.rows_found,
      setup_state_returned: setupState,
      portfolio_ids_returned: configSource.diagnostics.portfolio_ids_returned,
      zero_rows_reason: configSource.diagnostics.rows_found > 0 ? null : "portfolio_admin_config_query_returned_zero_rows",
    },
    build_sources: {
      admin_config: adminConfigs.length > 0,
      snapshots: await tableHasRows(tables.portfolioSnapshots),
      history: await tableHasRows(tables.totalPortfolioHistoryDaily),
      risk: portfolios.some((row) => row.risk_status !== null),
      hedge: portfolios.some((row) => row.hedge_status !== null),
      macro_regime: await tableExists("macro_regime_input"),
      sector_regime: await tableExists("sector_regime_input"),
    },
    pipeline_status: {
      snapshot_exists: snapshotExists,
      history_exists: historyExists,
      history_days_available: historyAvailableDays,
      positions_count: activePositionsCount,
      last_snapshot_build: lastSnapshotBuild,
      last_history_build: lastHistoryBuild,
      total_date_used: asOfDate,
      total_date_rule_used: "snapshot_exact_as_of_date",
      contributing_portfolio_ids: valuationIncludedPortfolioIds,
      excluded_portfolio_ids: valuationPerPortfolio.filter((item) => !item.used_for_total).map((item) => item.portfolio_id),
      trend_date_used: latestTotalHistoryDate || null,
      trend_contributing_portfolio_ids: contributingPortfolioIds,
    },
    valuation_contract_debug: {
      valuation_source_mode: "snapshot_as_of_date_strict",
      valuation_as_of_date: asOfDate,
      valuation_source_table: tables.portfolioSnapshots,
      total_market_value_source: "sum(snapshot.market_value for active+included portfolios on valuation_as_of_date)",
      total_market_value_sum_check: valuationTotalMarketValue,
      per_portfolio: valuationPerPortfolio,
      contract_ok_valuation_date_alignment: valuationPerPortfolio.every((p) => !p.used_for_total || p.date_used_for_market_value === asOfDate),
      contract_ok_total_equals_sum: valuationTotalEqualsSum,
    },
    total_inclusion_debug: {
      total_date_used: latestTotalHistoryDate || null,
      market_value_source: "trend_history_debug_only_not_used_for_overview_valuation",
      total_market_value_before: null,
      total_market_value_after: null,
      per_portfolio: perPortfolioTotalInclusion,
    },
    global_validation: {
      target_weight_sum_status: globalValidation.status,
      target_weight_sum: globalValidation.sum,
      deviation: globalValidation.deviation,
    },
    total: {
      allocation_plan_status: allocationPlanStatus,
      weighted_base_total_risk_score: (riskPayload as any).debug?.total?.weighted_base_total_risk_score ?? null,
      final_total_risk_score: totalRiskScore,
      final_total_risk_status: totalRiskStatus,
      weighted_average_hedge_severity: hedgePayload.total.weighted_average_hedge_severity,
      total_hedge_signal: totalHedgeSignal,
      dry_powder_debug: (hedgePayload as any).debug?.total?.dry_powder ?? null,
      drawdown_concentration: drawdownConcentration,
      excessive_junior_exposure: excessiveJuniorExposure,
      excessive_commodity_cyclicality: excessiveCommodityCyclicality,
    },
    portfolios: portfolios.map((row) => {
      const raw = (portfolioRows as any[]).find((source) => String(source.portfolio_id ?? "") === row.portfolio_id) ?? {};
      const snapshotDebug = parseJson(raw.debug_payload_json);
      const trendDebug = historyTrendByPortfolioId.get(row.portfolio_id)?.trend_debug ?? snapshotDebug?.trend ?? buildStructuredUnavailableTrendDebug(raw);
      const riskDebug = parseJson(raw.risk_debug_json);
      const hedgeDebug = parseJson(raw.hedge_debug_json);
      const canonicalLatestValue = asNullableFiniteNum(trendDebug.latest_value_sek);
      const buildWindowProof = (window: "20d" | "65d" | "200d") => {
        const days = windowKeyToDays(window);
        const anchorValue = asNullableFiniteNum(trendDebug[`anchor_${days}d_value_sek`] ?? trendDebug[`value_at_${days}d_anchor`]);
        const anchorDate = (trendDebug[`anchor_${days}d_date`] ?? null) as string | null;
        const rawUnrounded = (canonicalLatestValue !== null && anchorValue !== null && anchorValue > 0)
          ? ((canonicalLatestValue / anchorValue) - 1) * 100
          : null;
        const finalizedReturn = asNullableFiniteNum(trendDebug[`return_${days}d`]);
        const latestReturn = asNullableFiniteNum(row[`return_${days}d` as "return_20d" | "return_65d" | "return_200d"]);
        const uiDisplay = formatUiPercent(latestReturn);
        return {
          latest_value_raw: canonicalLatestValue,
          anchor_value_raw: anchorValue,
          anchor_date: anchorDate,
          raw_return_unrounded: rawUnrounded,
          raw_return_is_finite: Number.isFinite(rawUnrounded),
          raw_return_invalid_reason: trendDebug[`invalid_reason_${days}d`] ?? null,
          window_valid: Boolean(trendDebug[`return_${days}d_valid`]),
          finalized_return_value: finalizedReturn,
          finalized_direction: trendDebug[days === 20 ? "short_direction" : days === 65 ? "medium_direction" : "long_direction"] ?? "unavailable",
          finalized_trend_status: trendDebug.trend_status ?? "unavailable",
          finalized_trend_completeness: trendDebug.trend_completeness ?? trendDebug.signal_completeness ?? "unavailable",
          finalized_contract_error: Boolean(row.trend_contract_error),
          finalized_contract_reason: row.trend_contract_reason ?? null,
          serialized_return_value: latestReturn,
          serialized_return_type: latestReturn === null ? "null" : typeof latestReturn,
          serialized_direction: row[days === 20 ? "short_direction" : days === 65 ? "medium_direction" : "long_direction"] ?? "unavailable",
          serialized_trend_status: row.trend_status ?? "unavailable",
          serialized_trend_completeness: row.signal_completeness ?? "unavailable",
          serializer_applied_rounding: false,
          serializer_null_coercion: false,
          adapter_return_value: latestReturn,
          adapter_return_type: latestReturn === null ? "null" : typeof latestReturn,
          adapter_direction: row[days === 20 ? "short_direction" : days === 65 ? "medium_direction" : "long_direction"] ?? "unavailable",
          adapter_status: row.trend_status ?? "unavailable",
          adapter_completeness: row.signal_completeness ?? "unavailable",
          adapter_used_fallback: false,
          adapter_fallback_reason: "none",
          ui_input_return_value: latestReturn,
          ui_input_return_type: latestReturn === null ? "null" : typeof latestReturn,
          ui_display_string: uiDisplay,
          ui_display_mode: uiDisplay === "Unavailable" ? "unavailable" : "numeric_percent",
          ui_formatter_rounding_precision: 2,
          ui_null_to_zero_coercion: latestReturn === null && uiDisplay === "0.00%",
          ui_source_field_name: `return_${days}d`,
          conclusion: classifyDisplay(rawUnrounded, uiDisplay),
        };
      };

      return {
        portfolio_id: row.portfolio_id,
        validation: validationById.get(row.portfolio_id) ?? null,
        weight_debug: {
          band_width: snapshotDebug?.bandWidth ?? null,
          distance_to_edge: snapshotDebug?.distanceToEdge ?? null,
          weight_status: row.weight_status,
          rebalance_status: row.rebalance_status,
        },
        trend_debug: {
          attempted: trendDebug.attempted ?? true,
          available_days: trendDebug.available_days ?? null,
          first_history_date: trendDebug.first_history_date ?? null,
          last_history_date: trendDebug.last_history_date ?? null,
          latest_date: trendDebug.latest_date ?? trendDebug.last_history_date ?? null,
          latest_value_sek: trendDebug.latest_value_sek ?? null,
          history_source: trendDebug.history_source ?? null,
          return_20d: trendDebug.return_20d ?? null,
          return_65d: trendDebug.return_65d ?? null,
          return_200d: trendDebug.return_200d ?? null,
          anchor_20d_date: trendDebug.anchor_20d_date ?? null,
          anchor_65d_date: trendDebug.anchor_65d_date ?? null,
          anchor_200d_date: trendDebug.anchor_200d_date ?? null,
          anchor_20d_value_sek: trendDebug.anchor_20d_value_sek ?? trendDebug.value_at_20d_anchor ?? null,
          anchor_65d_value_sek: trendDebug.anchor_65d_value_sek ?? trendDebug.value_at_65d_anchor ?? null,
          anchor_200d_value_sek: trendDebug.anchor_200d_value_sek ?? trendDebug.value_at_200d_anchor ?? null,
          value_at_20d_anchor: trendDebug.value_at_20d_anchor ?? null,
          value_at_65d_anchor: trendDebug.value_at_65d_anchor ?? null,
          value_at_200d_anchor: trendDebug.value_at_200d_anchor ?? null,
          return_20d_valid: trendDebug.return_20d_valid ?? false,
          return_65d_valid: trendDebug.return_65d_valid ?? false,
          return_200d_valid: trendDebug.return_200d_valid ?? false,
          invalid_reasons_20d: trendDebug.invalid_reasons_20d ?? [],
          invalid_reasons_65d: trendDebug.invalid_reasons_65d ?? [],
          invalid_reasons_200d: trendDebug.invalid_reasons_200d ?? [],
          invalid_reason_20d: trendDebug.invalid_reason_20d ?? (Array.isArray(trendDebug.invalid_reasons_20d) ? trendDebug.invalid_reasons_20d[0] : null) ?? null,
          invalid_reason_65d: trendDebug.invalid_reason_65d ?? (Array.isArray(trendDebug.invalid_reasons_65d) ? trendDebug.invalid_reasons_65d[0] : null) ?? null,
          invalid_reason_200d: trendDebug.invalid_reason_200d ?? (Array.isArray(trendDebug.invalid_reasons_200d) ? trendDebug.invalid_reasons_200d[0] : null) ?? null,
          short_direction: trendDebug.short_direction ?? "unavailable",
          medium_direction: trendDebug.medium_direction ?? "unavailable",
          long_direction: trendDebug.long_direction ?? "unavailable",
          trend_status: trendDebug.trend_status ?? "unavailable",
          relative_strength_rank: trendDebug.relative_strength_rank ?? null,
          relative_strength_bucket: trendDebug.relative_strength_bucket ?? null,
          trend_completeness: trendDebug.trend_completeness ?? trendDebug.signal_completeness ?? "unavailable",
          data_quality: trendDebug.data_quality ?? null,
          reason: trendDebug.reason ?? (trendDebug.return_65d == null ? "insufficient_history" : "ok"),
        },
        contract_debug: {
          canonical_row_exists: true,
          latest_row_exists: true,
          overview_row_exists: true,
          ui_row_exists: null,
          canonical_market_value: trendDebug.latest_value_sek ?? null,
          latest_market_value: row.market_value ?? null,
          overview_market_value: row.market_value ?? null,
          ui_market_value: null,
          canonical_return_20d: trendDebug.return_20d ?? null,
          latest_return_20d: row.return_20d ?? null,
          overview_return_20d: row.return_20d ?? null,
          ui_return_20d: null,
          canonical_return_65d: trendDebug.return_65d ?? null,
          latest_return_65d: row.return_65d ?? null,
          overview_return_65d: row.return_65d ?? null,
          ui_return_65d: null,
          canonical_return_200d: trendDebug.return_200d ?? null,
          latest_return_200d: row.return_200d ?? null,
          overview_return_200d: row.return_200d ?? null,
          ui_return_200d: null,
          canonical_trend_completeness: trendDebug.trend_completeness ?? trendDebug.signal_completeness ?? null,
          latest_trend_completeness: row.signal_completeness ?? null,
          overview_trend_completeness: row.signal_completeness ?? null,
          ui_trend_completeness: null,
          canonical_short_direction: trendDebug.short_direction ?? null,
          latest_short_direction: row.short_direction ?? null,
          overview_short_direction: row.short_direction ?? null,
          ui_short_direction: null,
          canonical_medium_direction: trendDebug.medium_direction ?? null,
          latest_medium_direction: row.medium_direction ?? null,
          overview_medium_direction: row.medium_direction ?? null,
          ui_medium_direction: null,
          canonical_long_direction: trendDebug.long_direction ?? null,
          latest_long_direction: row.long_direction ?? null,
          overview_long_direction: row.long_direction ?? null,
          ui_long_direction: null,
          canonical_trend_status: trendDebug.trend_status ?? null,
          latest_trend_status: row.trend_status ?? null,
          overview_trend_status: row.trend_status ?? null,
          ui_trend_status: null,
          canonical_as_of_date: trendDebug.latest_date ?? trendDebug.last_history_date ?? null,
          latest_as_of_date: basePayload.as_of_date ?? null,
          overview_as_of_date: basePayload.as_of_date ?? null,
          ui_as_of_date: null,
          dashboard_adapter_return_20d: row.return_20d ?? null,
          dashboard_adapter_return_65d: row.return_65d ?? null,
          dashboard_adapter_return_200d: row.return_200d ?? null,
          dashboard_adapter_trend_completeness: row.signal_completeness ?? null,
          dashboard_adapter_short_direction: row.short_direction ?? null,
          dashboard_adapter_medium_direction: row.medium_direction ?? null,
          dashboard_adapter_long_direction: row.long_direction ?? null,
          contract_match_market_value: (trendDebug.latest_value_sek ?? null) === (row.market_value ?? null),
          contract_match_returns: (trendDebug.return_20d ?? null) === (row.return_20d ?? null)
            && (trendDebug.return_65d ?? null) === (row.return_65d ?? null)
            && (trendDebug.return_200d ?? null) === (row.return_200d ?? null),
          contract_match_directions: (trendDebug.short_direction ?? null) === (row.short_direction ?? null)
            && (trendDebug.medium_direction ?? null) === (row.medium_direction ?? null)
            && (trendDebug.long_direction ?? null) === (row.long_direction ?? null),
          contract_match_status: (trendDebug.trend_status ?? null) === (row.trend_status ?? null),
          contract_match_completeness: (trendDebug.trend_completeness ?? trendDebug.signal_completeness ?? null) === (row.signal_completeness ?? null),
          contract_match_dates: (trendDebug.latest_date ?? trendDebug.last_history_date ?? null) === (basePayload.as_of_date ?? null),
          contract_match_canonical_to_latest: (trendDebug.return_20d ?? null) === (row.return_20d ?? null)
            && (trendDebug.return_65d ?? null) === (row.return_65d ?? null)
            && (trendDebug.return_200d ?? null) === (row.return_200d ?? null)
            && (trendDebug.trend_status ?? null) === (row.trend_status ?? null)
            && (trendDebug.short_direction ?? null) === (row.short_direction ?? null)
            && (trendDebug.medium_direction ?? null) === (row.medium_direction ?? null)
            && (trendDebug.long_direction ?? null) === (row.long_direction ?? null)
            && (trendDebug.trend_completeness ?? trendDebug.signal_completeness ?? null) === (row.signal_completeness ?? null),
          contract_match_latest_to_adapter: true,
          contract_match_adapter_to_ui: null,
          terminal_value_used_for_returns: trendBasisByPortfolioId.get(row.portfolio_id)?.terminal_value_used_for_returns ?? (trendDebug.latest_value_sek ?? null),
          terminal_value_source: trendBasisByPortfolioId.get(row.portfolio_id)?.terminal_value_source ?? (trendDebug.history_source ?? "unknown"),
          displayed_market_value_source: trendBasisByPortfolioId.get(row.portfolio_id)?.displayed_market_value_source ?? "portfolio_snapshots.market_value",
          terminal_value_matches_displayed_market_value: trendBasisByPortfolioId.get(row.portfolio_id)?.terminal_value_matches_displayed_market_value
            ?? ((trendDebug.latest_value_sek ?? null) === (row.market_value ?? null)),
          terminal_date_used_for_returns: trendBasisByPortfolioId.get(row.portfolio_id)?.terminal_date_used_for_returns ?? (trendDebug.latest_date ?? trendDebug.last_history_date ?? null),
          displayed_as_of_date: trendBasisByPortfolioId.get(row.portfolio_id)?.displayed_as_of_date ?? (basePayload.as_of_date ?? null),
          terminal_date_matches_displayed_date: trendBasisByPortfolioId.get(row.portfolio_id)?.terminal_date_matches_displayed_date
            ?? ((trendDebug.latest_date ?? trendDebug.last_history_date ?? null) === (basePayload.as_of_date ?? null)),
          terminal_composition_hash: trendBasisByPortfolioId.get(row.portfolio_id)?.terminal_composition_hash ?? null,
          displayed_composition_hash: trendBasisByPortfolioId.get(row.portfolio_id)?.displayed_composition_hash ?? null,
          terminal_composition_matches_displayed: trendBasisByPortfolioId.get(row.portfolio_id)?.terminal_composition_matches_displayed ?? false,
          mixed_source_row_detected: trendBasisByPortfolioId.get(row.portfolio_id)?.mixed_source_row_detected ?? false,
          mismatch_stage: row.trend_contract_error ? "adapter" : (((trendDebug.latest_date ?? trendDebug.last_history_date ?? null) !== (basePayload.as_of_date ?? null)) ? "overview" : "none"),
          mismatch_reason: trendBasisByPortfolioId.get(row.portfolio_id)?.mismatch_reason
            ?? row.trend_contract_reason
            ?? (((trendDebug.latest_date ?? trendDebug.last_history_date ?? null) !== (basePayload.as_of_date ?? null)) ? "date_mismatch" : "none"),
        },
        return_proof_debug: {
          portfolio_label: row.portfolio_type ?? row.portfolio_name ?? row.portfolio_id,
          portfolio_id: row.portfolio_id,
          mapped_slug: row.portfolio_type ?? null,
          windows: {
            "20d": buildWindowProof("20d"),
            "65d": buildWindowProof("65d"),
            "200d": buildWindowProof("200d"),
          },
        },
        risk_debug: riskDebug
          ? {
            annualized_vol_65d: riskDebug?.volatility_component?.annualized_vol_65d ?? null,
            current_drawdown_pct: riskDebug?.drawdown_component?.current_drawdown_pct ?? null,
            top_holding_weight_pct: riskDebug?.concentration_component?.top_holding_weight_pct ?? null,
            volatility_component_score: riskDebug?.volatility_component?.score ?? null,
            drawdown_component_score: riskDebug?.drawdown_component?.score ?? null,
            concentration_component_score: riskDebug?.concentration_component?.score ?? null,
            cyclicality_component_score: riskDebug?.cyclicality_component?.final_score ?? null,
            available_component_count: riskDebug?.available_component_count ?? null,
            risk_score: riskDebug?.risk_score ?? null,
            risk_status: riskDebug?.risk_status ?? null,
            strategic_risk_level: riskDebug?.strategic_risk_level ?? null,
            risk_mismatch_flag: riskDebug?.risk_mismatch_flag ?? null,
          }
          : null,
        hedge_debug: hedgeDebug
          ? {
            risk_contribution: hedgeDebug?.score_components?.risk_contribution ?? null,
            trend_contribution: hedgeDebug?.score_components?.trend_contribution ?? null,
            weight_contribution: hedgeDebug?.score_components?.weight_contribution ?? null,
            macro_overlay_contribution: hedgeDebug?.score_components?.macro_overlay_contribution ?? null,
            sector_overlay_contribution: hedgeDebug?.score_components?.sector_overlay_contribution ?? null,
            hedge_need_score: hedgeDebug?.hedge_need_score ?? null,
            raw_hedge_status: hedgeDebug?.raw_hedge_status ?? null,
            final_hedge_status: hedgeDebug?.final_hedge_status ?? null,
            suggested_hedge_type: hedgeDebug?.suggested_hedge_type ?? null,
            hedge_policy_applied: hedgeDebug?.hedge_policy_applied ?? null,
            signal_completeness: hedgeDebug?.signal_completeness ?? null,
          }
          : null,
        data_quality_flags: row.data_quality_flags,
      };
    }),
  };

  return {
    ...basePayload,
    debug: debugPayload,
  };
}
