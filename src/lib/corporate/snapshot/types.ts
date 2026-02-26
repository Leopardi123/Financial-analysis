export type MarketValueInput = {
  // Market-now equity inputs
  shares_current: number | null;
  price_current_TargetCurrency: number | null;

  // Enterprise adjustments (optional)
  preferredEquity_TargetCurrency?: number | null;
  minorityInterest_TargetCurrency?: number | null;
};

export type MarketValueOutput = {
  MarketCap_TargetCurrency: number | null;
  EnterpriseAdjustments_TargetCurrency: number;
  EV_TargetCurrency: number | null;

  EV_over_NPV: number | null;
  EV_over_NAV: number | null;
  P_over_NAV: number | null;

  EV_perShare_TargetCurrency: number | null; // EVPS = EV / shares_current
};

export type CorporateSnapshot = {
  targetCurrency: string;

  aggregation: import('../types.ts').CorporateAggregationOutput;

  financing: import('../financing/types.ts').CorporateFinancingOutput;

  marketValue: MarketValueOutput;

  MarketCap_TargetCurrency: number | null;
  EV_TargetCurrency: number | null;
  EV_perShare_TargetCurrency: number | null;
  EV_over_NPV: number | null;
  EV_over_NAV: number | null;
  P_over_NAV: number | null;

  // Convenience
  NPV_today_TargetCurrency: number | null;
  NAV_today_TargetCurrency: number | null;
};
