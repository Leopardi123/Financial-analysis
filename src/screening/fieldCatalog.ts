import type { ScreeningFieldDef } from "./types.ts";

export const SCREENING_FIELDS: ScreeningFieldDef[] = [
  { key: "return_5d", label: "Return 5D", group: "price", dataType: "number", unit: "percent", source: "price_screen_snapshot", simple: true, advanced: true, description: "Prisförändring över 5 handelsdagar.", interpretation: "20 betyder +20% avkastning på 5 dagar.", example: "Sätt > 10 för att hitta aktier upp minst 10% på 5 dagar." },
  { key: "return_20d", label: "Return 20D", group: "price", dataType: "number", unit: "percent", source: "price_screen_snapshot", simple: true, advanced: true, description: "Prisförändring över 20 handelsdagar.", interpretation: "20 betyder +20% avkastning på 20 dagar.", example: "Sätt > 5 för att hitta aktier upp minst 5% senaste månaden." },
  { key: "return_60d", label: "Return 60D", group: "price", dataType: "number", unit: "percent", source: "price_screen_snapshot", simple: true, advanced: true, description: "Prisförändring över 60 handelsdagar.", interpretation: "20 betyder +20% avkastning på 60 dagar.", example: "Sätt > 0 för positiv 60-dagars trend." },
  { key: "drawdown_20d", label: "Drawdown 20D", group: "price", dataType: "number", unit: "percent", source: "price_screen_snapshot", simple: true, advanced: true, description: "Price decline from highest price over last 20 trading days.", interpretation: "20 means price is down 20% from recent high.", example: "Sätt >= 20 för att hitta aktier minst 20% under 20D-high." },
  { key: "drawdown_60d", label: "Drawdown 60D", group: "price", dataType: "number", unit: "percent", source: "price_screen_snapshot", simple: true, advanced: true, description: "Price decline from highest price over last 60 trading days.", interpretation: "20 means price is down 20% from recent high.", example: "Sätt >= 25 för tydlig selloff." },
  { key: "drawdown_252d", label: "Drawdown 252D (future)", group: "price", dataType: "number", unit: "percent", source: "future_cycle_snapshot", simple: false, advanced: true, description: "Price decline from 52-week high.", interpretation: "20 means price is down 20% from yearly high.", example: "Sätt >= 30 för djupare drawdown över längre fönster." },
  { key: "trend_state", label: "Trend state", group: "price", dataType: "string", unit: "state", source: "price_screen_snapshot", simple: true, advanced: true, description: "Förenklad trendklass: up/down/sideways.", interpretation: "in up,sideways matchar båda tillstånden.", example: "Använd == up för trendföljande screening." },
  { key: "recovery_state", label: "Recovery state", group: "price", dataType: "string", unit: "state", source: "price_screen_snapshot", simple: true, advanced: true, description: "Fas efter drawdown: selloff/stabilizing/early_reversal/near_highs.", interpretation: "in stabilizing,early_reversal fångar återhämtningsfas.", example: "Använd == near_highs för momentum nära toppar." },

  { key: "revenue_growth", label: "Revenue growth", group: "fundamentals", dataType: "number", unit: "percent", source: "company income", simple: false, advanced: true },
  { key: "ebit_growth", label: "EBITDA growth", group: "fundamentals", dataType: "number", unit: "percent", source: "company income", simple: false, advanced: true },
  { key: "net_income_growth", label: "Net income growth", group: "fundamentals", dataType: "number", unit: "percent", source: "company income", simple: true, advanced: true },
  { key: "operating_cash_flow", label: "Operating cash flow", group: "fundamentals", dataType: "number", unit: "absolute", source: "company cashflow", simple: true, advanced: true },
  { key: "free_cash_flow", label: "Free cash flow", group: "fundamentals", dataType: "number", unit: "absolute", source: "company cashflow", simple: true, advanced: true },

  { key: "debt_to_equity", label: "Debt to equity", group: "risk", dataType: "number", unit: "ratio", source: "company balance", simple: true, advanced: true },
  { key: "net_cash_flag", label: "Net cash flag", group: "risk", dataType: "boolean", unit: "state", source: "company balance", simple: false, advanced: true },
  { key: "current_ratio", label: "Current ratio", group: "risk", dataType: "number", unit: "ratio", source: "company balance", simple: false, advanced: true },
  { key: "dilution", label: "Dilution", group: "risk", dataType: "number", unit: "percent", source: "company income", simple: false, advanced: true },
  { key: "runway_months", label: "Runway months", group: "risk", dataType: "number", unit: "absolute", source: "company cash/burn", simple: true, advanced: true },

  { key: "project_npv", label: "Project NPV (future)", group: "mining", dataType: "number", unit: "absolute", source: "future project snapshot", simple: false, advanced: true },
  { key: "nav", label: "NAV (future)", group: "mining", dataType: "number", unit: "absolute", source: "future project snapshot", simple: false, advanced: true },
  { key: "ev_over_npv", label: "EV/NPV (future)", group: "mining", dataType: "number", unit: "ratio", source: "future project snapshot", simple: false, advanced: true },

  { key: "founderFlag", label: "Founder flag", group: "manual", dataType: "number", unit: "absolute", source: "manual overrides", simple: true, advanced: true },
  { key: "insiderScore", label: "Insider score", group: "manual", dataType: "number", unit: "absolute", source: "manual overrides", simple: true, advanced: true },
  { key: "reratingFlag", label: "Rerating flag", group: "manual", dataType: "number", unit: "absolute", source: "manual overrides", simple: true, advanced: true },
  { key: "jurisdictionFlag", label: "Jurisdiction flag", group: "manual", dataType: "number", unit: "absolute", source: "manual overrides", simple: false, advanced: true },
  { key: "managementFlag", label: "Management flag", group: "manual", dataType: "number", unit: "absolute", source: "manual overrides", simple: false, advanced: true },
];

export const SCREENING_FIELD_MAP = new Map(SCREENING_FIELDS.map((field) => [field.key, field]));
