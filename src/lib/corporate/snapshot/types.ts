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


export type CorporateSnapshotEconomicsBreakdownSeries = {
  cogs?: {
    miningUSD?: Array<number | null>;
    millingUSD?: Array<number | null>;
    utilitiesUSD?: Array<number | null>;
    maintenanceUSD?: Array<number | null>;
    campUSD?: Array<number | null>;
    siteGandA_USD?: Array<number | null>;
  };
  selling?: {
    treatmentChargesUSD?: Array<number | null>;
    refiningChargesUSD?: Array<number | null>;
    tcRcUSD?: Array<number | null>;
    transportUSD?: Array<number | null>;
  };
  totalCogsUSD?: Array<number | null>;
  totalSellingUSD?: Array<number | null>;
  totalOperatingCostsUSD?: Array<number | null>;
};

export type CorporateSnapshotSeries = {
  periodIndex: number[];
  periodEndDatesUtc: Array<string | null>;
  oreMinedTonnes: Array<number | null>;
  oreMilledTonnes: Array<number | null>;
  throughputUnit: 'tpd' | 'tpa' | null;
  nameplateThroughput: number | null;
  utilizationPct: number | null;
  payableQtyByMetal: Record<string, Array<number | null>>;
  payableQtyUnitByMetal: Record<string, string>;
  priceUsedByMetal_USD: Record<string, Array<number | null>>;
  revenueByMetal_USD: Record<string, Array<number | null>>;
  totalRevenue_USD: Array<number | null>;
  operatingCostsUSD: Array<number | null>;
  sustainingCapexUSD: Array<number | null>;
  siteGandA_USD: Array<number | null>;
  royaltiesUSD: Array<number | null>;
  reclamationUSD: Array<number | null>;
  byproductCreditsUSD: Array<number | null>;
  sustainingCostUSD: Array<number | null>;
  ebitdaUSD?: Array<number | null>;
  depreciationUSD?: Array<number | null>;
  ebitUSD: Array<number | null>;
  taxableIncomeUSD?: Array<number | null>;
  effectiveTaxRate?: Array<number | null>;
  taxUSD: Array<number | null>;
  workingCapitalDeltaUSD?: Array<number | null>;
  fcffUSD: Array<number | null>;
  capexUSD: Array<number | null>;
  totalCapexUSD: Array<number | null>;
  economicsBreakdown?: CorporateSnapshotEconomicsBreakdownSeries;
  royaltiesDetail?: Array<{
    id: string;
    label: string;
    royaltyUSD: Array<number | null>;
  }>;
  taxesDetail?: {
    federalIncomeTaxUSD?: Array<number | null>;
    municipalRevenueTaxUSD?: Array<number | null>;
  };
  unitAudit?: {
    metals: Record<string, {
      qtyUnit: string;
      canonicalQtyUnit: 'toz' | 'lb' | 'tonne';
      priceUnit: string;
      canonicalPriceUnit: 'toz' | 'lb' | 'tonne';
      conversionFactorExample?: number;
      warnings: string[];
    }>;
  };
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
  NPV_today_perShare_TargetCurrency: number | null;
  NAV_today_perShare_TargetCurrency: number | null;
  EVPS_TargetCurrency: number | null;

  CF_LOM_USD: number | null;
  CF_LOM_perShare_USD: number | null;
  CF_LOM_prodStart_perShare_USD: number | null;
  DCF_prodStart_exCapex_USD: number | null;
  DCF_prodStart_exCapex_perShare_USD: number | null;
  DCF_prodStart_present_USD: number | null;
  DCF_prodStart_present_perShare_USD: number | null;

  CF_LOM_TargetCurrency: number | null;
  CF_LOM_perShare_TargetCurrency: number | null;
  CF_LOM_prodStart_perShare_TargetCurrency: number | null;
  DCF_prodStart_exCapex_TargetCurrency: number | null;
  DCF_prodStart_exCapex_perShare_TargetCurrency: number | null;
  DCF_prodStart_present_TargetCurrency: number | null;
  DCF_prodStart_present_perShare_TargetCurrency: number | null;

  Payback_approx_years: number | null;
  Payback_real_years: number | null;
  ROI_10Y_pct: number | null;
  LOM_average_EBIT_ROCE_pct: number | null;
  LOM_discounted_EBIT_ROCE_pct: number | null;
  Kapitalavkastning_LOM: number | null;
  Kapitalavkastning_per_Ar_LOM: number | null;

  Time_to_production: number | null;
  LOM_periods: number | null;
  LOM_production_AuEq_Oz: number | null;
  Annual_production_AuEq_Oz: number | null;
  AISC_AuEq_USD_per_Oz_LOM: number | null;
  CAPEX_per_annual_AuEq_Oz: number | null;

  NPV_over_ETLV: number | null;
  DCF_present_over_ETLV: number | null;
  DCF_prodStart_over_ETLV: number | null;

  Revenue_10Y_USD: number | null;
  FCFF_10Y_USD: number | null;
  AuEq_Oz_10Y: number | null;
  InSituValue_10Y_USD: number | null;
  InSituValue_perShare_10Y_USD: number | null;

  Revenue_10Y_TargetCurrency: number | null;
  FCFF_10Y_TargetCurrency: number | null;
  InSituValue_10Y_TargetCurrency: number | null;
  InSituValue_perShare_10Y_TargetCurrency: number | null;
  in_situ_value_TargetCurrency: number | null;
  in_situ_value_per_share_TargetCurrency: number | null;
  Revenue_10Y_perShare_TargetCurrency: number | null;
  FCFF_10Y_perShare_TargetCurrency: number | null;
  EV_over_Revenue_10Y: number | null;

  BookValue_USD: number | null;
  BookValue_perShare_USD_shares_current: number | null;
  BookValue_perShare_USD_shares_post_financing: number | null;

  series?: CorporateSnapshotSeries;

};
