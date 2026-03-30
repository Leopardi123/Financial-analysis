import type { ScreeningFieldDef } from "./types";

export const SCREENING_FIELDS: ScreeningFieldDef[] = [
  { key: "return_5d", label: "Return 5D", group: "price", dataType: "number", source: "price_screen_snapshot", simple: true, advanced: true },
  { key: "return_20d", label: "Return 20D", group: "price", dataType: "number", source: "price_screen_snapshot", simple: true, advanced: true },
  { key: "return_60d", label: "Return 60D", group: "price", dataType: "number", source: "price_screen_snapshot", simple: true, advanced: true },
  { key: "drawdown_20d", label: "Drawdown 20D", group: "price", dataType: "number", source: "price_screen_snapshot", simple: true, advanced: true },
  { key: "drawdown_60d", label: "Drawdown 60D", group: "price", dataType: "number", source: "price_screen_snapshot", simple: true, advanced: true },
  { key: "drawdown_252d", label: "Drawdown 252D (future)", group: "price", dataType: "number", source: "future_cycle_snapshot", simple: false, advanced: true },
  { key: "trend_state", label: "Trend state", group: "price", dataType: "string", source: "price_screen_snapshot", simple: true, advanced: true },
  { key: "recovery_state", label: "Recovery state", group: "price", dataType: "string", source: "price_screen_snapshot", simple: true, advanced: true },

  { key: "revenue_growth", label: "Revenue growth", group: "fundamentals", dataType: "number", source: "company income", simple: false, advanced: true },
  { key: "ebit_growth", label: "EBITDA growth", group: "fundamentals", dataType: "number", source: "company income", simple: false, advanced: true },
  { key: "net_income_growth", label: "Net income growth", group: "fundamentals", dataType: "number", source: "company income", simple: true, advanced: true },
  { key: "operating_cash_flow", label: "Operating cash flow", group: "fundamentals", dataType: "number", source: "company cashflow", simple: true, advanced: true },
  { key: "free_cash_flow", label: "Free cash flow", group: "fundamentals", dataType: "number", source: "company cashflow", simple: true, advanced: true },

  { key: "debt_to_equity", label: "Debt to equity", group: "risk", dataType: "number", source: "company balance", simple: true, advanced: true },
  { key: "net_cash_flag", label: "Net cash flag", group: "risk", dataType: "boolean", source: "company balance", simple: false, advanced: true },
  { key: "current_ratio", label: "Current ratio", group: "risk", dataType: "number", source: "company balance", simple: false, advanced: true },
  { key: "dilution", label: "Dilution", group: "risk", dataType: "number", source: "company income", simple: false, advanced: true },
  { key: "runway_months", label: "Runway months", group: "risk", dataType: "number", source: "company cash/burn", simple: true, advanced: true },

  { key: "project_npv", label: "Project NPV (future)", group: "mining", dataType: "number", source: "future project snapshot", simple: false, advanced: true },
  { key: "nav", label: "NAV (future)", group: "mining", dataType: "number", source: "future project snapshot", simple: false, advanced: true },
  { key: "ev_over_npv", label: "EV/NPV (future)", group: "mining", dataType: "number", source: "future project snapshot", simple: false, advanced: true },

  { key: "founderFlag", label: "Founder flag", group: "manual", dataType: "number", source: "manual overrides", simple: true, advanced: true },
  { key: "insiderScore", label: "Insider score", group: "manual", dataType: "number", source: "manual overrides", simple: true, advanced: true },
  { key: "reratingFlag", label: "Rerating flag", group: "manual", dataType: "number", source: "manual overrides", simple: true, advanced: true },
  { key: "jurisdictionFlag", label: "Jurisdiction flag", group: "manual", dataType: "number", source: "manual overrides", simple: false, advanced: true },
  { key: "managementFlag", label: "Management flag", group: "manual", dataType: "number", source: "manual overrides", simple: false, advanced: true },
];

export const SCREENING_FIELD_MAP = new Map(SCREENING_FIELDS.map((field) => [field.key, field]));
