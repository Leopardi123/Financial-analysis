import type {
  GlobalWeightValidation,
  PortfolioAdminConfig,
  PortfolioValidationIssue,
  RebalanceMode,
  StrategicRiskLevel,
  PortfolioType,
} from "./types.js";

const PORTFOLIO_TYPES: PortfolioType[] = [
  "stable_income",
  "growth",
  "commodity_majors",
  "commodity_junior",
  "opportunistic",
];

const STRATEGIC_RISK_LEVELS: StrategicRiskLevel[] = ["low", "medium", "high", "extreme"];
const REBALANCE_MODES: RebalanceMode[] = ["soft", "standard", "strict"];

const ALLOWED_HEDGE_TYPES = [
  "index_put",
  "index_short",
  "inverse_etf",
  "gold",
  "cash",
  "usd",
  "commodity_put",
  "producer_pair_hedge",
  "no_direct_hedge_use_position_reduction",
];

const ALLOWED_HEDGE_PURPOSES = [
  "market_drawdown",
  "cyclical_downturn",
  "inflation_shock",
  "deflationary_stress",
  "usd_strength",
  "commodity_downturn",
  "duration_risk",
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function toJsonArrayText(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        return { ok: false, error: "must be a JSON array" };
      }
      return { ok: true, value: JSON.stringify(parsed) };
    } catch {
      return { ok: false, error: "must be valid JSON" };
    }
  }

  if (!Array.isArray(value)) {
    return { ok: false, error: "must be an array or JSON array string" };
  }

  return { ok: true, value: JSON.stringify(value) };
}

export function validatePortfolioConfig(config: Partial<PortfolioAdminConfig>, mode: "create" | "update"): string[] {
  const errors: string[] = [];

  const requiredFields: Array<keyof PortfolioAdminConfig> = [
    "portfolio_id",
    "portfolio_name",
    "portfolio_type",
    "active",
    "visible_in_overview",
    "included_in_total_portfolio",
    "sort_order",
    "target_weight_pct",
    "min_weight_pct",
    "max_weight_pct",
    "strategic_risk_level",
    "hedging_allowed",
    "rebalance_mode",
    "role_description",
    "allowed_hedge_types_json",
    "hedge_purpose_json",
  ];

  if (mode === "create") {
    for (const field of requiredFields) {
      if (config[field] === undefined) {
        errors.push(`${field} is required`);
      }
    }
  }

  const requiredNonEmptyText: Array<keyof PortfolioAdminConfig> = [
    "portfolio_id",
    "portfolio_name",
    "role_description",
  ];
  for (const field of requiredNonEmptyText) {
    const value = config[field];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (typeof config.portfolio_type === "string" && !PORTFOLIO_TYPES.includes(config.portfolio_type as PortfolioType)) {
    errors.push(`portfolio_type must be one of: ${PORTFOLIO_TYPES.join(", ")}`);
  }

  if (
    typeof config.strategic_risk_level === "string"
    && !STRATEGIC_RISK_LEVELS.includes(config.strategic_risk_level as StrategicRiskLevel)
  ) {
    errors.push(`strategic_risk_level must be one of: ${STRATEGIC_RISK_LEVELS.join(", ")}`);
  }

  if (typeof config.rebalance_mode === "string" && !REBALANCE_MODES.includes(config.rebalance_mode as RebalanceMode)) {
    errors.push(`rebalance_mode must be one of: ${REBALANCE_MODES.join(", ")}`);
  }

  if (config.target_weight_pct !== undefined && !isFiniteNumber(config.target_weight_pct)) {
    errors.push("target_weight_pct must be a finite number");
  }
  if (config.sort_order !== undefined && !Number.isInteger(config.sort_order)) {
    errors.push("sort_order must be an integer");
  }

  const requiredBooleanFields: Array<keyof PortfolioAdminConfig> = [
    "active",
    "visible_in_overview",
    "included_in_total_portfolio",
    "hedging_allowed",
  ];
  for (const field of requiredBooleanFields) {
    if (config[field] !== undefined && !isBoolean(config[field])) {
      errors.push(`${field} must be a boolean`);
    }
  }

  if (config.analyst_override_allowed !== undefined && config.analyst_override_allowed !== null && !isBoolean(config.analyst_override_allowed)) {
    errors.push("analyst_override_allowed must be boolean or null");
  }

  if (config.min_weight_pct !== undefined && !isFiniteNumber(config.min_weight_pct)) {
    errors.push("min_weight_pct must be a finite number");
  }

  if (config.max_weight_pct !== undefined && !isFiniteNumber(config.max_weight_pct)) {
    errors.push("max_weight_pct must be a finite number");
  }

  if (isFiniteNumber(config.target_weight_pct) && config.target_weight_pct < 0) {
    errors.push("target_weight_pct must be >= 0");
  }

  if (isFiniteNumber(config.min_weight_pct) && config.min_weight_pct < 0) {
    errors.push("min_weight_pct must be >= 0");
  }

  if (isFiniteNumber(config.max_weight_pct) && config.max_weight_pct < 0) {
    errors.push("max_weight_pct must be >= 0");
  }

  if (isFiniteNumber(config.max_weight_pct) && config.max_weight_pct > 100) {
    errors.push("max_weight_pct must be <= 100");
  }

  if (config.max_hedge_pct !== undefined && config.max_hedge_pct !== null && !isFiniteNumber(config.max_hedge_pct)) {
    errors.push("max_hedge_pct must be a finite number or null");
  }

  if (isFiniteNumber(config.max_hedge_pct) && (config.max_hedge_pct < 0 || config.max_hedge_pct > 100)) {
    errors.push("max_hedge_pct must be between 0 and 100");
  }

  if (
    isFiniteNumber(config.min_weight_pct)
    && isFiniteNumber(config.target_weight_pct)
    && isFiniteNumber(config.max_weight_pct)
  ) {
    if (!(config.min_weight_pct <= config.target_weight_pct && config.target_weight_pct <= config.max_weight_pct)) {
      errors.push("min_weight_pct <= target_weight_pct <= max_weight_pct must hold");
    }
  }

  if (config.allowed_hedge_types_json !== undefined) {
    const parsed = toJsonArrayText(config.allowed_hedge_types_json);
    if (!parsed.ok) {
      errors.push(`allowed_hedge_types_json ${parsed.error}`);
    } else {
      const values = JSON.parse(parsed.value);
      const invalid = values.filter((value: unknown) => typeof value !== "string" || !ALLOWED_HEDGE_TYPES.includes(value));
      if (invalid.length > 0) {
        errors.push("allowed_hedge_types_json contains invalid value");
      }
    }
  }

  if (config.hedge_purpose_json !== undefined) {
    const parsed = toJsonArrayText(config.hedge_purpose_json);
    if (!parsed.ok) {
      errors.push(`hedge_purpose_json ${parsed.error}`);
    } else {
      const values = JSON.parse(parsed.value);
      const invalid = values.filter((value: unknown) => typeof value !== "string" || !ALLOWED_HEDGE_PURPOSES.includes(value));
      if (invalid.length > 0) {
        errors.push("hedge_purpose_json contains invalid value");
      }
    }
  }

  return errors;
}

export function validateGlobalTargetWeight(portfolios: PortfolioAdminConfig[]): GlobalWeightValidation {
  const sum = portfolios
    .filter((portfolio) => portfolio.active && portfolio.included_in_total_portfolio)
    .reduce((total, portfolio) => total + portfolio.target_weight_pct, 0);

  const deviation = Math.abs(sum - 100);
  if (deviation <= 0.1) {
    return { status: "valid", sum, deviation };
  }
  if (deviation <= 1.0) {
    return { status: "warning", sum, deviation };
  }
  return { status: "error", sum, deviation };
}

export function buildPerPortfolioValidationIssues(portfolios: PortfolioAdminConfig[]): PortfolioValidationIssue[] {
  return portfolios.map((portfolio) => {
    const errors = validatePortfolioConfig(portfolio, "update");
    return {
      portfolio_id: portfolio.portfolio_id,
      band_valid: !errors.some((error) => error.includes("min_weight_pct <= target_weight_pct <= max_weight_pct")),
      enum_valid:
        !errors.some((error) => error.startsWith("portfolio_type"))
        && !errors.some((error) => error.startsWith("strategic_risk_level"))
        && !errors.some((error) => error.startsWith("rebalance_mode")),
      errors,
    };
  });
}
