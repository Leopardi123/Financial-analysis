export type PortfolioType =
  | "stable_income"
  | "growth"
  | "commodity_majors"
  | "commodity_junior"
  | "opportunistic";

export type StrategicRiskLevel = "low" | "medium" | "high" | "extreme";

export type RebalanceMode = "soft" | "standard" | "strict";

export type ValidationStatus = "valid" | "warning" | "error";

export type PortfolioAdminConfig = {
  portfolio_id: string;
  portfolio_name: string;
  portfolio_type: PortfolioType;
  active: boolean;
  visible_in_overview: boolean;
  included_in_total_portfolio: boolean;
  sort_order: number;
  target_weight_pct: number;
  min_weight_pct: number;
  max_weight_pct: number;
  strategic_risk_level: StrategicRiskLevel;
  hedging_allowed: boolean;
  max_hedge_pct: number | null;
  rebalance_mode: RebalanceMode;
  role_description: string;
  long_term_purpose: string | null;
  notes: string | null;
  allowed_hedge_types_json: string;
  hedge_purpose_json: string;
  created_at: string;
  updated_at: string;
  rebalance_priority: number | null;
  max_single_position_pct: number | null;
  max_sector_concentration_pct: number | null;
  max_commodity_concentration_pct: number | null;
  max_junior_exposure_pct: number | null;
  max_illiquid_exposure_pct: number | null;
  analyst_override_allowed: boolean | null;
  analyst_override_note: string | null;
  override_expiry_date: string | null;
};

export type PortfolioValidationIssue = {
  portfolio_id: string;
  band_valid: boolean;
  enum_valid: boolean;
  errors: string[];
};

export type GlobalWeightValidation = {
  status: ValidationStatus;
  sum: number;
  deviation: number;
};
