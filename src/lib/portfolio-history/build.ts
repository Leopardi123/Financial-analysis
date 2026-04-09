import { query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import { listPortfolioConfigs } from "../portfolio-admin/repository.js";
import type { PortfolioAdminConfig } from "../portfolio-admin/types.js";
import { materializePortfolioHistoryCanonical } from "./canonical.js";

function maskDatabaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname || "unknown";
    return `${url.protocol}//***@${host}${url.pathname}`;
  } catch {
    return "***";
  }
}

function detectRuntimeEnv(): "preview" | "production" | "unknown" {
  const vercelEnv = String(process.env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "production") return "production";
  return "unknown";
}

export async function loadPortfolioConfigsForHistoryBuild(): Promise<{
  portfolios: PortfolioAdminConfig[];
  source_table_used: string | null;
  query_used: string | null;
  db_url_masked: string | null;
  runtime_env: "preview" | "production" | "unknown" | null;
  filters_applied: string[];
  error: string | null;
}> {
  let configs: PortfolioAdminConfig[] | null = null;
  const diagnostics = {
    portfolios: [] as PortfolioAdminConfig[],
    source_table_used: null as string | null,
    query_used: null as string | null,
    db_url_masked: maskDatabaseUrl(process.env.TURSO_DATABASE_URL),
    runtime_env: detectRuntimeEnv(),
    filters_applied: [] as string[],
    error: null as string | null,
  };

  try {
    configs = await listPortfolioConfigs();
    diagnostics.source_table_used = tables.portfolioAdminConfig;
    diagnostics.query_used = `SELECT * FROM ${tables.portfolioAdminConfig} ORDER BY sort_order ASC, portfolio_id ASC`;
    diagnostics.filters_applied = ["none (all rows from portfolio_admin_config, ordered by sort_order)"];
  } catch {
    diagnostics.error = "admin_config_failed";
    configs = null;
  }

  if (!configs || configs.length === 0) {
    const fallbackRows = await query(
      `SELECT DISTINCT portfolio_id FROM ${tables.portfolioPositions} WHERE portfolio_id IS NOT NULL AND TRIM(portfolio_id) <> '' ORDER BY portfolio_id ASC`
    ) as Array<{ portfolio_id?: unknown }>;
    configs = fallbackRows
      .map((row) => String(row.portfolio_id ?? "").trim())
      .filter(Boolean)
      .map((portfolioId, index) => ({
        portfolio_id: portfolioId,
        portfolio_name: portfolioId,
        portfolio_type: "opportunistic",
        active: true,
        visible_in_overview: true,
        included_in_total_portfolio: true,
        sort_order: index + 1,
        target_weight_pct: 0,
        min_weight_pct: 0,
        max_weight_pct: 100,
        strategic_risk_level: "medium",
        hedging_allowed: true,
        max_hedge_pct: null,
        rebalance_mode: "standard",
        role_description: "Derived fallback portfolio configuration for history rebuild.",
        long_term_purpose: null,
        notes: "Generated fallback config.",
        allowed_hedge_types_json: "[]",
        hedge_purpose_json: "[]",
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
        rebalance_priority: null,
        max_single_position_pct: null,
        max_sector_concentration_pct: null,
        max_commodity_concentration_pct: null,
        max_junior_exposure_pct: null,
        max_illiquid_exposure_pct: null,
        analyst_override_allowed: null,
        analyst_override_note: null,
        override_expiry_date: null,
      }));
    diagnostics.source_table_used = "fallback";
    diagnostics.query_used = "fallback_positions_query";
    diagnostics.filters_applied = ["fallback enabled when portfolio_admin_config has 0 rows or failed"];
  }

  diagnostics.portfolios = configs;
  return diagnostics;
}

export async function buildPortfolioHistory() {
  const result = await materializePortfolioHistoryCanonical();
  return {
    portfolios: result.portfolios.map((item) => ({
      portfolio_id: item.portfolio_id,
      history_source: "canonical_v2",
      coverage: null,
      positions: [],
      trend_explanation: `Canonical source ${result.canonical_source_version}`,
      available_days: item.daily_series.length,
      first_history_date: item.first_history_date,
      last_history_date: item.last_history_date,
      latest_value: item.latest_value_sek,
      return_20d: item.return_20d,
      return_65d: item.return_65d,
      return_200d: item.return_200d,
      anchor_20d_date: item.anchor_20d_date,
      anchor_65d_date: item.anchor_65d_date,
      anchor_200d_date: item.anchor_200d_date,
      value_at_20d_anchor: item.anchor_20d_value_sek,
      value_at_65d_anchor: item.anchor_65d_value_sek,
      value_at_200d_anchor: item.anchor_200d_value_sek,
      return_20d_valid: item.return_20d_valid,
      return_65d_valid: item.return_65d_valid,
      return_200d_valid: item.return_200d_valid,
      invalid_reasons_20d: item.invalid_reason_20d ? [item.invalid_reason_20d] : [],
      invalid_reasons_65d: item.invalid_reason_65d ? [item.invalid_reason_65d] : [],
      invalid_reasons_200d: item.invalid_reason_200d ? [item.invalid_reason_200d] : [],
      short_direction: item.short_direction,
      medium_direction: item.medium_direction,
      long_direction: item.long_direction,
      trend_status: item.trend_status,
      signal_completeness: item.trend_completeness,
      trend_completeness: item.trend_completeness,
      data_quality: item.data_quality,
      relative_strength_rank: null,
      relative_strength_bucket: "unavailable",
    })),
    total: result.total,
  };
}
