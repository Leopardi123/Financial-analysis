import type { PortfolioAdminConfig } from "../../../../lib/portfolio-admin/types.js";
import {
  buildPerPortfolioValidationIssues,
  toJsonArrayText,
  validateGlobalTargetWeight,
  validatePortfolioConfig,
} from "../../../../lib/portfolio-admin/validation.js";

export function parseRequestBody(req: any): any {
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }
  return req.body ?? {};
}

export function buildDiagnostics(portfolios: PortfolioAdminConfig[]) {
  const global = validateGlobalTargetWeight(portfolios);
  const perPortfolio = buildPerPortfolioValidationIssues(portfolios);

  return {
    portfolios_count: portfolios.length,
    active_included_count: portfolios.filter((portfolio) => portfolio.active && portfolio.included_in_total_portfolio).length,
    target_weight_sum: global.sum,
    validation_status: global.status,
    validation_breakdown: perPortfolio,
  };
}

export function normalizePortfolioPayload(
  payload: Record<string, unknown>,
  existing: PortfolioAdminConfig | null,
  mode: "create" | "update"
): { ok: true; value: Partial<PortfolioAdminConfig> } | { ok: false; errors: string[] } {
  const now = new Date().toISOString();
  const merged: Partial<PortfolioAdminConfig> = {
    ...existing,
    ...payload,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  if (typeof merged.portfolio_id === "string") {
    merged.portfolio_id = merged.portfolio_id.trim();
  }

  if (payload.allowed_hedge_types_json !== undefined) {
    const parsed = toJsonArrayText(payload.allowed_hedge_types_json);
    if (parsed.ok) {
      merged.allowed_hedge_types_json = parsed.value;
    }
  }

  if (payload.hedge_purpose_json !== undefined) {
    const parsed = toJsonArrayText(payload.hedge_purpose_json);
    if (parsed.ok) {
      merged.hedge_purpose_json = parsed.value;
    }
  }

  const errors = validatePortfolioConfig(merged, mode);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: merged };
}
