export type CorporateFinancingInput = {
  // From corporate project aggregation (Layer 2):
  npvToday_USD_total: number | null;

  // FX:
  fx_USD_to_TargetCurrency: number | null;

  // Balance sheet at t=0 in TargetCurrency:
  cash_TargetCurrency_t0: number | null;
  debt_TargetCurrency_t0: number | null;

  // Optional enterprise adjustments (default 0):
  preferredEquity_TargetCurrency_t0?: number | null;
  minorityInterest_TargetCurrency_t0?: number | null;

  // Cash-first allocation:
  cashUsedForProjectFinancing_TargetCurrency_t0?: number | null; // default 0
};

export type CorporateFinancingOutput = {
  npvToday_TargetCurrency: number | null;

  cash_AfterCashFirst_TargetCurrency_t0: number | null;
  debt_TargetCurrency_t0: number | null;

  netCash_TargetCurrency_t0: number | null; // cash_after - debt

  navToday_TargetCurrency: number | null; // NPV_target + netCash

  enterpriseAdjustments_TargetCurrency_t0: number | null; // preferred + minority
  // EV components (without market cap):
  // EV = MarketCap + debt - cash + enterpriseAdjustments. MarketCap is not in scope.
  // We still expose the additive component (debt - cash_after + adjustments) to be used later.
  evAdditive_Component_TargetCurrency_t0: number | null; // debt - cash_after + enterpriseAdjustments
};
