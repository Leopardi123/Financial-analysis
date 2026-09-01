import type { Lista3Metrics } from '../../metrics/lista3.ts';
import type { Lista3DebugPayload } from '../../metrics/lista3.ts';
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

export type CorporateValuationTimeSeriesRow = {
  period: number;
  year: number;
  dcfAbsolute: number | null;
  navAbsolute: number | null;
  npvAbsolute: number | null;
  dcfPerShare: number | null;
  dcfExCapexAbsolute: number | null;
  dcfExCapexPerShare: number | null;
  navPerShare: number | null;
  npvPerShare: number | null;
  sharesPf: number | null;
  ebitdaTarget: number | null;
  ev5xTarget: number | null;
  ev6xTarget: number | null;
  ev7xTarget: number | null;
  evEbitda5xPerShare: number | null;
  evEbitda6xPerShare: number | null;
  evEbitda7xPerShare: number | null;
};

export type CorporateValuationProjectMarker = {
  projectId: string;
  projectName: string | null | undefined;
  constructionStartPeriod: number | null;
  constructionStartYear: number | null;
  productionStartPeriod: number | null;
  productionStartYear: number | null;
  firstContributionPeriod: number | null;
  lastContributionPeriod: number | null;
};

export type CorporateValuationTimeSeries = {
  valuationYear: number;
  internalCorporateYears: number[];
  rows: CorporateValuationTimeSeriesRow[];
  projectMarkers: CorporateValuationProjectMarker[];
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
  yearsByPeriod: number[];
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
  sustainingAdjustedOperatingEarningsUSD?: Array<number | null>;
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

  fx_USD_to_TargetCurrency?: number | null;
  discountRate?: number;
  market?: MarketValueInput;

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

  corporate?: {
    lista3Metrics: Lista3Metrics;
    lista3Debug?: Lista3DebugPayload & {
      shares_post_financing: number | null;
      series: Lista3DebugPayload['series'] & {
        capexUSD_total: Array<number | null>;
      };
    };
  };

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
  corporateValuationTimeSeries?: CorporateValuationTimeSeries;

  project?: {
    modeled?: {
      npvSpotRange?: {
        low: {
          npvToday: number | null;
          npvSeries: Array<number | null>;
          irr: number | null;
          payback: number | null;
          lomAvgEbitRoce: number | null;
          kapitalavkastningLom: number | null;
          inSitu10YUsd: number | null;
        };
        base: {
          npvToday: number | null;
          npvSeries: Array<number | null>;
          irr: number | null;
          payback: number | null;
          lomAvgEbitRoce: number | null;
          kapitalavkastningLom: number | null;
          inSitu10YUsd: number | null;
        };
        high: {
          npvToday: number | null;
          npvSeries: Array<number | null>;
          irr: number | null;
          payback: number | null;
          lomAvgEbitRoce: number | null;
          kapitalavkastningLom: number | null;
          inSitu10YUsd: number | null;
        };
      } | null;
    };
  };

  modeledValuationTimeline?: {
    tps: number[];
    lastTp: number | null;
    rangeEndTp: number | null;
    markers: Array<{
      tp: number;
      yearLabelUsed: string | null;
      corporateTpIndexUsed: number | null;
      fcfTailSumUSD: number | null;
      value_high: number | null;
      value_low: number | null;
      value_mid_if_any: number | null;
      nullReasonIfAny: string | null;
      lista2Metrics?: {
        DCF_prodStart_exCapex_TargetCurrency: number | null;
        DCF_prodStart_exCapex_perShare_TargetCurrency: number | null;
        DCF_prodStart_present_TargetCurrency: number | null;
        DCF_prodStart_present_perShare_TargetCurrency: number | null;
        NPV_prodStart_TargetCurrency: number | null;
        NPV_prodStart_perShare_TargetCurrency: number | null;
        NAV_prodStart_TargetCurrency: number | null;
        NAV_prodStart_perShare_TargetCurrency: number | null;
        InitialCAPEX_incremental_TargetCurrency: number | null;
      };
    }>;
  };

};