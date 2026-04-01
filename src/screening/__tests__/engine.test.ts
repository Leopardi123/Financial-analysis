import { evaluateScreen } from "../engine.ts";
import type { CompanySnapshot, ScreenDefinition } from "../types.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const screen: ScreenDefinition = {
  id: "test",
  name: "test",
  category: "test",
  description: "test",
  checks: [],
  ignores: [],
  requiredFields: [],
  optionalFields: [],
  fallback: "",
  rules: {
    mustHave: [
      { id: "a", field: "operating_cash_flow", operator: ">", value: 0 },
      { id: "b", field: "debt_to_equity", operator: "<=", value: 2 },
      { id: "c", field: "trend_state", operator: "==", value: "up" },
    ],
  },
};

const snapshot: CompanySnapshot = {
  ticker: "TEST",
  years: [2025, 2024],
  income: { revenue: [100, 120], netIncome: [10, 14], weightedAverageShsOut: [100, 102] },
  balance: { totalLiabilities: [50, 60], totalStockholdersEquity: [100, 110] },
  cashflow: { operatingCashFlow: [20, 25], freeCashFlow: [5, 6] },
  manual: {},
  price: { trend_state: "up", return_20d: 0.1 },
};

(function run() {
  const result = evaluateScreen({ snapshot, screen });
  assert(result.matched, "expected all mustHave rules to pass");
  assert(result.score === 3, "expected score to equal number of passed rules");
  assert(result.evaluationStatus === "passed", "expected passed status");
  assert(result.excludeReasons.length === 0, "expected no excludes on fully passing snapshot");

  const failed = evaluateScreen({
    snapshot: { ...snapshot, price: { trend_state: "down" } },
    screen,
  });
  assert(!failed.matched, "expected fail when trend_state mismatches");
  assert(failed.evaluationStatus === "failed", "expected failed status");
  assert(failed.excludeReasons.length > 0, "expected at least one exclude reason");

  const corporateCashScreen: ScreenDefinition = {
    ...screen,
    rules: { mustHave: [{ id: "corp-cash", field: "corp_cash_over_market_cap", operator: ">=", value: 0.2 }] },
  };
  const corporateCashResult = evaluateScreen({
    snapshot: {
      ...snapshot,
      profile: { mktCap: 1000 },
      reportedQuarterlyBalance: { cashAndCashEquivalents: [null, 300] },
      corporateSnapshot: { MarketCap_TargetCurrency: 10_000_000, shares_post_financing: 999999999 },
      corpCashOverMarketCapDebug: { finalRatioValue: 0.42, missingReason: null },
    },
    screen: corporateCashScreen,
  });
  assert(corporateCashResult.ruleResults[0]?.value === 0.42, "expected corp cash / market cap to prefer currency-aligned precomputed ratio");

  const drawdown252Screen: ScreenDefinition = {
    ...screen,
    rules: { mustHave: [{ id: "dd252", field: "drawdown_252d", operator: ">=", value: 10 }] },
  };
  const drawdown252Result = evaluateScreen({
    snapshot: { ...snapshot, price: { drawdown_252d: -0.25 } },
    screen: drawdown252Screen,
  });
  assert(drawdown252Result.ruleResults[0]?.value === 25, "expected drawdown_252d to convert to positive percent");

  console.log("screening engine tests passed");
})();
