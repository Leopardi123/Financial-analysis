import { query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { listPortfolioConfigs } from "../portfolio-admin/repository.js";
import { buildPerPortfolioValidationIssues, validateGlobalTargetWeight } from "../portfolio-admin/validation.js";
import { getLatestPortfolioRisk } from "../portfolio-risk/build.js";
import { getLatestPortfolioHedgeAndDryPowder } from "../portfolio-hedge/build.js";

function asNum(value: unknown): number | null {
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

export async function getPortfolioOverviewLatest(debug: boolean) {
  const latestRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.portfolioSnapshots}`);
  const asOfDate = String(latestRows[0]?.as_of_date ?? "").trim() || null;

  const adminConfigs = await listPortfolioConfigs();
  const globalValidation = validateGlobalTargetWeight(adminConfigs);
  const validationById = new Map(buildPerPortfolioValidationIssues(adminConfigs).map((item) => [item.portfolio_id, item]));

  const riskPayload = await getLatestPortfolioRisk();
  const hedgePayload = await getLatestPortfolioHedgeAndDryPowder();

  const portfolioRows = asOfDate
    ? await query(
      `SELECT s.*, a.portfolio_name, a.portfolio_type, a.sort_order, a.active, a.included_in_total_portfolio
       FROM ${tables.portfolioSnapshots} s
       LEFT JOIN ${tables.portfolioAdminConfig} a ON a.portfolio_id = s.portfolio_id
       WHERE s.as_of_date = ?
       ORDER BY a.sort_order ASC, s.portfolio_id ASC`,
      [asOfDate]
    )
    : [];

  const totalHistoryLatestRows = await query(`SELECT MAX(as_of_date) AS as_of_date FROM ${tables.totalPortfolioHistoryDaily}`);
  const latestTotalHistoryDate = String(totalHistoryLatestRows[0]?.as_of_date ?? "").trim();
  const totalHistoryRow = latestTotalHistoryDate
    ? (await query(
      `SELECT as_of_date, market_value, daily_return_pct, cumulative_return_pct, drawdown_pct, data_quality
       FROM ${tables.totalPortfolioHistoryDaily}
       WHERE as_of_date = ? LIMIT 1`,
      [latestTotalHistoryDate]
    ))[0]
    : null;
  const totalHistoryCountRows = await query(`SELECT COUNT(*) AS count FROM ${tables.totalPortfolioHistoryDaily}`);
  const historyAvailableDays = Number(totalHistoryCountRows[0]?.count ?? 0);

  const allocationPlanStatus = computeAllocationPlanStatus(portfolioRows as any[]);
  const included = (portfolioRows as any[]).filter((row) => Number(row.active ?? 0) === 1 && Number(row.included_in_total_portfolio ?? 0) === 1);
  const includedMarketValues = included
    .map((row) => asNum(row.market_value))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const totalMarketValue = includedMarketValues.length > 0
    ? includedMarketValues.reduce((sum, value) => sum + value, 0)
    : null;

  const totalRiskStatus = riskPayload.total.total_risk_status;
  const totalRiskScore = riskPayload.total.total_risk_score;
  const totalHedgeSignal = hedgePayload.total.total_hedge_signal;
  const dryPowderStatus = hedgePayload.total.dry_powder_status;

  const majorWarnings: string[] = [];
  if (adminConfigs.length > 0) {
    if (globalValidation.status !== "valid") majorWarnings.push("target_weight_sum_warning");
    if (allocationPlanStatus === "outside_allocation_plan") majorWarnings.push("allocation_outside_plan");
    if (allocationPlanStatus === "materially_outside_allocation_plan") majorWarnings.push("allocation_materially_outside_plan");
  }
  if (totalRiskStatus === "high") majorWarnings.push("total_risk_high");
  if (totalRiskStatus === "critical") majorWarnings.push("total_risk_critical");
  if (totalHedgeSignal === "hedge_recommended") majorWarnings.push("hedge_recommended");
  if (totalHedgeSignal === "hedge_urgent") majorWarnings.push("hedge_urgent");
  if (dryPowderStatus === "insufficient_dry_powder") majorWarnings.push("insufficient_dry_powder");

  const drawdownConcentration = computeDrawdownConcentration(portfolioRows as any[]);
  const excessiveJuniorExposure = computeExcessiveJuniorExposure(portfolioRows as any[]);
  const excessiveCommodityCyclicality = computeExcessiveCommodityCyclicality(portfolioRows as any[], totalRiskStatus);

  if (drawdownConcentration === true) majorWarnings.push("drawdown_concentration");
  if (excessiveJuniorExposure === true) majorWarnings.push("excessive_junior_exposure");
  if (excessiveCommodityCyclicality === true) majorWarnings.push("excessive_commodity_cyclicality");

  const unavailableCount = (portfolioRows as any[]).filter((row) => {
    const flags = buildDataQualityFlags(row);
    return flags.weight_unavailable && flags.trend_unavailable && flags.risk_unavailable && flags.hedge_unavailable;
  }).length;
  const partialCount = (portfolioRows as any[]).filter((row) => {
    const flags = buildDataQualityFlags(row);
    return !flags.weight_unavailable || !flags.trend_unavailable || !flags.risk_unavailable || !flags.hedge_unavailable;
  }).length;

  if (unavailableCount > 0 && partialCount > 0) majorWarnings.push("data_partial");
  if ((portfolioRows as any[]).length === 0 || unavailableCount === (portfolioRows as any[]).length) majorWarnings.push("data_unavailable");

  const portfolios = (portfolioRows as any[]).map((row) => ({
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
    return_20d: asNum(row.return_20d),
    return_65d: asNum(row.return_65d),
    return_200d: asNum(row.return_200d),
    trend_status: row.trend_status == null ? null : String(row.trend_status),
    relative_strength_bucket: row.relative_strength_bucket == null ? null : String(row.relative_strength_bucket),
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
    signal_completeness: row.signal_completeness == null ? null : String(row.signal_completeness),
    data_quality_flags: buildDataQualityFlags(row),
  }));

  const snapshotIds = new Set((portfolioRows as any[]).map((row) => String(row.portfolio_id ?? "")).filter((id) => id.length > 0));
  const portfoliosConfiguredCount = adminConfigs.length;
  const portfoliosWithSnapshotsCount = snapshotIds.size;
  const setupState: "no_config" | "configured_no_data" | "partial" | "live" = portfoliosConfiguredCount === 0
    ? "no_config"
    : portfoliosWithSnapshotsCount === 0
      ? "configured_no_data"
      : (majorWarnings.includes("data_partial") || majorWarnings.includes("data_unavailable"))
        ? "partial"
        : "live";

  const basePayload = {
    as_of_date: asOfDate,
    total: {
      market_value: totalMarketValue,
      allocation_plan_status: allocationPlanStatus,
      total_risk_score: totalRiskScore,
      total_risk_status: totalRiskStatus,
      total_hedge_signal: totalHedgeSignal,
      dry_powder_status: dryPowderStatus,
      opportunistic_weight_pct: hedgePayload.total.opportunistic_weight_pct,
      required_min_dry_powder_pct: hedgePayload.total.required_min_dry_powder_pct,
      included_portfolio_count: included.length,
      major_warnings: Array.from(new Set(majorWarnings)),
    },
    performance: {
      daily_return_pct: asNum(totalHistoryRow?.daily_return_pct),
      cumulative_return_pct: asNum(totalHistoryRow?.cumulative_return_pct),
      drawdown_pct: asNum(totalHistoryRow?.drawdown_pct),
      history_available_days: historyAvailableDays,
      data_quality: totalHistoryRow?.data_quality == null ? "unavailable" : String(totalHistoryRow.data_quality),
    },
    portfolios,
    setup: {
      setup_state: setupState,
      portfolios_configured_count: portfoliosConfiguredCount,
      portfolios_with_snapshots_count: portfoliosWithSnapshotsCount,
      history_available_days: historyAvailableDays,
    },
  };

  if (!debug) return basePayload;

  const debugPayload = {
    build_sources: {
      admin_config: adminConfigs.length > 0,
      snapshots: await tableHasRows(tables.portfolioSnapshots),
      history: await tableHasRows(tables.totalPortfolioHistoryDaily),
      risk: portfolios.some((row) => row.risk_status !== null),
      hedge: portfolios.some((row) => row.hedge_status !== null),
      macro_regime: await tableExists("macro_regime_input"),
      sector_regime: await tableExists("sector_regime_input"),
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
      const trendDebug = snapshotDebug?.trend ?? null;
      const riskDebug = parseJson(raw.risk_debug_json);
      const hedgeDebug = parseJson(raw.hedge_debug_json);

      return {
        portfolio_id: row.portfolio_id,
        validation: validationById.get(row.portfolio_id) ?? null,
        weight_debug: {
          band_width: snapshotDebug?.bandWidth ?? null,
          distance_to_edge: snapshotDebug?.distanceToEdge ?? null,
          weight_status: row.weight_status,
          rebalance_status: row.rebalance_status,
        },
        trend_debug: trendDebug
          ? {
            available_days: trendDebug.available_days ?? null,
            return_20d: trendDebug.return_20d ?? null,
            return_65d: trendDebug.return_65d ?? null,
            return_200d: trendDebug.return_200d ?? null,
            short_direction: trendDebug.short_direction ?? null,
            medium_direction: trendDebug.medium_direction ?? null,
            long_direction: trendDebug.long_direction ?? null,
            trend_status: trendDebug.trend_status ?? null,
            relative_strength_rank: trendDebug.relative_strength_rank ?? null,
            relative_strength_bucket: trendDebug.relative_strength_bucket ?? null,
          }
          : null,
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
