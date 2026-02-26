export type CorporateFinancingInput = {
  // Preferred Lista 5 naming
  NPV_today_USD: number | null;
  targetCurrency?: 'USD' | 'SEK' | 'CAD' | 'EUR' | string;
  fx_USD_to_TargetCurrency: number;
  cash_t0_TargetCurrency?: number | null;
  debt_t0_TargetCurrency?: number | null;
  shares_current: number | null;
  price_current_TargetCurrency: number | null;
  financingPlan?: {
    debt_fraction?: number | null;
    equity_fraction?: number | null;
    use_cash_first?: boolean | null;
    cash_use_cap_TargetCurrency?: number | null;
    equity_raise_price_TargetCurrency?: number | null;
  } | null;
  buildFundingNeed_USD?: number | null;

  // Legacy aliases kept for compatibility with existing pipeline/tests.
  npvToday_USD_total?: number | null;
  cash_TargetCurrency_t0?: number | null;
  debt_TargetCurrency_t0?: number | null;
  cashUsedForProjectFinancing_TargetCurrency_t0?: number | null;
};

export type CorporateFinancingOutput = {
  cash_used_for_build_TargetCurrency: number | null;
  cash_t0_post_TargetCurrency: number | null;

  new_debt_TargetCurrency: number | null;
  debt_t0_post_TargetCurrency: number | null;

  equity_raised_TargetCurrency: number | null;
  new_shares: number | null;
  shares_post_financing: number | null;

  NPV_today_TargetCurrency: number | null;
  NAV_today_TargetCurrency: number | null;
  Debt_to_Equity_ratio: number | null;

  // Legacy aliases kept for compatibility.
  npvToday_TargetCurrency: number | null;
  navToday_TargetCurrency: number | null;
  cash_AfterCashFirst_TargetCurrency_t0: number | null;
  debt_TargetCurrency_t0: number | null;
  netCash_TargetCurrency_t0: number | null;
  enterpriseAdjustments_TargetCurrency_t0: number | null;
  evAdditive_Component_TargetCurrency_t0: number | null;
};
