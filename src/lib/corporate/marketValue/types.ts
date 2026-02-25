export type CorporateMarketValueInput = {
  // Market inputs
  price_current_TargetCurrency: number | null;
  shares_current: number | null;

  // Balance sheet t=0 inputs (post cash-first)
  cash_AfterCashFirst_TargetCurrency_t0: number | null;
  debt_TargetCurrency_t0: number | null;

  // Optional enterprise adjustments
  enterpriseAdjustments_TargetCurrency_t0?: number | null; // default 0

  // Valuation references (already computed elsewhere)
  npvToday_TargetCurrency: number | null; // enterprise valuation reference
  navToday_TargetCurrency: number | null; // equity valuation reference
};

export type CorporateMarketValueOutput = {
  marketCap_TargetCurrency: number | null;
  ev_TargetCurrency: number | null;
  evPerShare_TargetCurrency: number | null; // EVPS, EV/shares_current

  ev_over_npv: number | null; // EV / NPV_today
  ev_over_nav: number | null; // EV / NAV_today (note mismatch, still output)
  p_over_nav: number | null; // MarketCap / NAV_today
};
