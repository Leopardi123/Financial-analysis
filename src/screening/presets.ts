import type { ScreenDefinition } from "./types";

export const SCREENING_PRESETS: ScreenDefinition[] = [
  {
    id: "buffet-dividend-light",
    name: "Buffet Dividend Aristocrats (Light)",
    category: "Dividend / Buffetology",
    description: "Stabilt kassaflöde, utdelningsdisciplin och rimlig skuldsättning.",
    checks: ["Operating cash flow > 0", "Free cash flow > 0", "Debt/Equity under tröskel"],
    ignores: ["Makrotiming", "Kortsiktigt prisbrus"],
    requiredFields: ["operating_cash_flow", "free_cash_flow", "debt_to_equity"],
    optionalFields: ["net_income_growth"],
    defaults: { maxDebtToEquity: 2 },
    fallback: "Om skuldsättning saknas markeras bolaget som fail i mustHave.",
    rules: {
      mustHave: [
        { id: "ocf-positive", field: "operating_cash_flow", operator: ">", value: 0 },
        { id: "fcf-positive", field: "free_cash_flow", operator: ">", value: 0 },
        { id: "debt-equity-cap", field: "debt_to_equity", operator: "<=", value: { param: "maxDebtToEquity" } },
      ],
    },
  },
  {
    id: "cashflow-funded-dividends",
    name: "Cashflow funded + low leverage",
    category: "Dividend / Quality",
    description: "Bolag där kassaflöde och balansräkning stödjer utdelning över tid.",
    checks: ["Operating cash flow > 0", "Free cash flow > 0", "Debt/Equity <= 1.5"],
    ignores: ["Direktavkastning i sig"],
    requiredFields: ["operating_cash_flow", "free_cash_flow", "debt_to_equity"],
    optionalFields: [],
    defaults: { maxDebtToEquity: 1.5 },
    fallback: "Saknade datapunkter ger fail för respektive mustHave.",
    rules: {
      mustHave: [
        { id: "ocf-pos", field: "operating_cash_flow", operator: ">", value: 0 },
        { id: "fcf-pos", field: "free_cash_flow", operator: ">", value: 0 },
        { id: "de-low", field: "debt_to_equity", operator: "<=", value: { param: "maxDebtToEquity" } },
      ],
    },
  },
  {
    id: "recovery-after-selloff",
    name: "Recovery after selloff",
    category: "Price / Recovery",
    description: "Djup drawdown med tidig stabilisering/reversal.",
    checks: ["Drawdown 60D <= -25%", "Recovery state stabilizing/early_reversal", "Return 20D > -10%"],
    ignores: ["Värderingsmultiplar"],
    requiredFields: ["drawdown_60d", "recovery_state", "return_20d"],
    optionalFields: ["trend_state"],
    fallback: "Om pris-snapshot saknas blir preseten informativ men matchar inte.",
    rules: {
      mustHave: [
        { id: "dd60", field: "drawdown_60d", operator: ">=", value: 25 },
        { id: "recovery", field: "recovery_state", operator: "in", value: ["stabilizing", "early_reversal"] },
        { id: "ret20", field: "return_20d", operator: ">", value: -10 },
      ],
    },
  },
  {
    id: "trend-following-quality",
    name: "Trend following quality",
    category: "Price + Fundamentals",
    description: "Upptrend i pris kombinerat med positivt kassaflöde.",
    checks: ["Trend state up", "Return 60D > 0", "Operating cash flow > 0"],
    ignores: ["Manuella analyst flags"],
    requiredFields: ["trend_state", "return_60d", "operating_cash_flow"],
    optionalFields: ["debt_to_equity"],
    fallback: "Kräver pris-snapshot + company fundamentals.",
    rules: {
      mustHave: [
        { id: "trend", field: "trend_state", operator: "==", value: "up" },
        { id: "ret60-pos", field: "return_60d", operator: ">", value: 0 },
        { id: "ocf-pos", field: "operating_cash_flow", operator: ">", value: 0 },
      ],
    },
  },
  {
    id: "founder-capital-allocator",
    name: "Founder-led capital allocator",
    category: "Manual / Quality",
    description: "Founder-signal + lönsamhet + begränsad utspädning.",
    checks: ["founderFlag > 0", "net_income_growth > 0", "dilution <= 5%"],
    ignores: ["Kortsiktig trend"],
    requiredFields: ["founderFlag", "net_income_growth", "dilution"],
    optionalFields: ["insiderScore"],
    defaults: { maxDilution: 5 },
    fallback: "Manual flags kan sättas i Analyst/Manual overrides.",
    rules: {
      mustHave: [
        { id: "founder", field: "founderFlag", operator: ">", value: 0 },
        { id: "ni-growth", field: "net_income_growth", operator: ">", value: 0 },
        { id: "dil", field: "dilution", operator: "<=", value: { param: "maxDilution" } },
      ],
    },
  },
];

export function getPresetById(id: string) {
  return SCREENING_PRESETS.find((preset) => preset.id === id) ?? SCREENING_PRESETS[0];
}
