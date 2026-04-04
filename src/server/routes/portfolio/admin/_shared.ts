import type { PortfolioAdminConfig } from "../../../../lib/portfolio-admin/types.js";
import {
  buildPerPortfolioValidationIssues,
  toJsonArrayText,
  validateGlobalTargetWeight,
  validatePortfolioConfig,
} from "../../../../lib/portfolio-admin/validation.js";

type ValidationPayload = {
  type: "validation_error";
  message: string;
  fieldErrors: Record<string, string>;
  formErrors: string[];
};

const FRIENDLY_FIELD_LABELS: Record<string, string> = {
  portfolio_id: "Portfolio ID",
  portfolio_name: "Portfolio name",
  portfolio_type: "Portfolio type",
  sort_order: "Sort order",
  target_weight_pct: "Target weight %",
  min_weight_pct: "Min weight %",
  max_weight_pct: "Max weight %",
  strategic_risk_level: "Strategic risk level",
  rebalance_mode: "Rebalance mode",
  active: "Active",
  visible_in_overview: "Visible in overview",
  included_in_total_portfolio: "Included in total portfolio",
  hedging_allowed: "Hedging allowed",
  max_hedge_pct: "Max hedge %",
  allowed_hedge_types_json: "Allowed hedge types",
  hedge_purpose_json: "Hedge purpose",
  role_description: "Role description",
};

export function parseRequestBody(req: any): any {
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }
  return req.body ?? {};
}

export function buildValidationPayload(errors: string[], fallbackMessage = "Please correct the highlighted fields"): ValidationPayload {
  const fieldErrors: Record<string, string> = {};
  const formErrors: string[] = [];

  if (errors.length === 0) {
    formErrors.push(fallbackMessage);
  }

  for (const err of errors) {
    const field = Object.keys(FRIENDLY_FIELD_LABELS).find((key) => err.startsWith(`${key} `) || err.startsWith(`${key} must`) || err.includes(key));
    if (field) {
      const friendlyLabel = FRIENDLY_FIELD_LABELS[field];
      const normalized = err.replace(`${field} `, "").replace(`${field} `, "");
      fieldErrors[field] = normalized.startsWith("must") || normalized.startsWith("contains")
        ? `${friendlyLabel} ${normalized}`
        : `${friendlyLabel}: ${normalized}`;
    } else {
      formErrors.push(err);
    }
  }

  if (Object.keys(fieldErrors).length > 0 && formErrors.length === 0) {
    formErrors.push(fallbackMessage);
  }

  return {
    type: "validation_error",
    message: "Validation failed",
    fieldErrors,
    formErrors,
  };
}

function parseNumberish(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function inferFieldErrorsFromPayload(payload: Record<string, unknown>): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  const requiredNumeric = ["sort_order", "target_weight_pct", "min_weight_pct", "max_weight_pct"];
  for (const field of requiredNumeric) {
    if (payload[field] !== undefined && parseNumberish(payload[field]) === null) {
      fieldErrors[field] = `${FRIENDLY_FIELD_LABELS[field]} must be a valid number`;
    }
  }

  if (payload.max_hedge_pct !== undefined && payload.max_hedge_pct !== null && parseNumberish(payload.max_hedge_pct) === null) {
    fieldErrors.max_hedge_pct = "Max hedge % must be a valid number or empty";
  }

  const boolFields = ["active", "visible_in_overview", "included_in_total_portfolio", "hedging_allowed"];
  for (const field of boolFields) {
    if (payload[field] !== undefined && typeof payload[field] !== "boolean") {
      fieldErrors[field] = `${FRIENDLY_FIELD_LABELS[field] ?? field} must be true or false`;
    }
  }

  for (const field of ["allowed_hedge_types_json", "hedge_purpose_json"]) {
    if (payload[field] === undefined) continue;
    const parsed = toJsonArrayText(payload[field]);
    if (!parsed.ok) {
      fieldErrors[field] = `${FRIENDLY_FIELD_LABELS[field]} must be a valid list`;
    }
  }

  return fieldErrors;
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

  const numericFields: Array<keyof PortfolioAdminConfig> = [
    "sort_order",
    "target_weight_pct",
    "min_weight_pct",
    "max_weight_pct",
  ];
  for (const field of numericFields) {
    const value = merged[field];
    if (typeof value === "string") {
      const parsed = Number(value.replace(",", ".").trim());
      merged[field] = Number.isFinite(parsed) ? parsed as any : value as any;
    }
  }

  const maxHedgeRaw = merged.max_hedge_pct as unknown;
  if (typeof maxHedgeRaw === "string") {
    const cleaned = maxHedgeRaw.replace(",", ".").trim();
    if (cleaned === "") {
      merged.max_hedge_pct = null;
    } else {
      const parsed = Number(cleaned);
      merged.max_hedge_pct = Number.isFinite(parsed) ? parsed : (merged.max_hedge_pct as any);
    }
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
