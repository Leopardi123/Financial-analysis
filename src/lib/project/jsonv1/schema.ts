import type { StreamMVIConfig } from '../streams/types.ts';
import type {
  ProjectReportedCostBasis,
  ProjectReportedCostByProductTreatment,
  ProjectReportedCostComponentTreatment,
  ProjectReportedCostCoProductMethod,
  ProjectReportedCostDenominator,
  ProjectReportedCostPeriod,
  ProjectReportedCostQuality,
} from './costSemantics.ts';

export type QtyUnit = 'toz' | 'g' | 'kg' | 'lb' | 'tonne' | 'short_ton' | 'long_ton';
export type PriceUnit = 'USD_per_toz' | 'USD_per_lb' | 'USD_per_tonne';

export type ProjectReportedCostMetric =
  | 'AISC_AU_USD_PER_TOZ'
  | 'AISC_AG_CO_PRODUCT_USD_PER_TOZ'
  | 'AISC_AGEQ_USD_PER_TOZ'
  | 'C1_CU_USD_PER_LB'
  | 'AISC_ZNEQ_USD_PER_LB'
  | 'C1_NI_USD_PER_LB'
  | 'AISC_NI_USD_PER_LB'
  | 'AISC_PGM3E_USD_PER_TOZ';

export type ProjectJsonV1 = {
  version: 'project_json_v2';
  meta?: { projectId?: string; projectName?: string; currency?: 'USD'; notes?: string; disabled?: boolean };
  time: { masterN: number; productionStartPeriod: number; productionStartYear: number };
  economics: { taxRate?: number | null };
  equity?: { fdExtraShares?: number | null; fdNotes?: string | null };
  series: {
    capexUSD: Array<number | null>;
    operatingCostsUSD: Array<number | null>;
    sustainingCapexUSD: Array<number | null>;
    siteGandA_USD: Array<number | null>;
    depreciationUSD?: Array<number | null>;
    workingCapitalDeltaUSD?: Array<number | null>;
    royaltiesUSD?: Array<number | null>;
    reclamationUSD: Array<number | null>;
    byproductCreditsUSD?: Array<number | null>;
    taxCashFlowUSD?: Array<number | null>;
    terminalProceedsUSD?: Array<number | null>;
  };
  metals: {
    payableQtyByMetal: Record<string, Array<number | null>>;
    payableQtyUnitByMetal: Record<string, QtyUnit>;
    priceKeyByMetal: Record<string, string>;
    auPriceKey: string | null;
    spotPriceUSDByMetal?: Record<string, Array<number | null>>;
    spotPriceUnitByMetal?: Record<string, PriceUnit>;
    auPriceUSDPerOz?: Array<number | null>;
  };
  streamsByMetal?: Record<string, StreamMVIConfig> | null;
  takeItems?: Array<unknown> | null;
  operations?: {
    capacity: { throughputUnit: 'tpd' | 'tpa' | null; nameplateThroughput: number | null; utilizationPct?: number | null };
    oreMilledTonnes?: Array<number | null>;
    oreMinedTonnes?: Array<number | null>;
    oreTonnageUnit?: 'tonne' | 'short_ton' | 'long_ton' | null;
    gradeByMetal?: Record<string, Array<number | null>>;
    gradeUnitByMetal?: Record<string, 'gpt' | 'pct' | 'ozpt' | string>;
    recoveryPctByMetal?: Record<string, Array<number | null>>;
  } | null;
  economicsBreakdown?: {
    meta?: { defaultSource?: 'PEA' | 'PFS' | 'FS' | 'Other' | null; notes?: string | null } | null;
    /** Report evidence. `metric` is a legacy family/selector, not proof of benchmark compatibility. */
    reportedCostMetrics?: Array<{
      metric: ProjectReportedCostMetric;
      reportedLabel?: string | null;
      value: number;
      unit: 'USD/lb' | 'USD/toz';
      definitionNotes?: string | null;
      primaryMetal?: string | null;
      basis?: ProjectReportedCostBasis | null;
      denominator?: ProjectReportedCostDenominator | null;
      period?: ProjectReportedCostPeriod | null;
      byProductTreatment?: ProjectReportedCostByProductTreatment | null;
      royaltyTreatment?: ProjectReportedCostComponentTreatment | null;
      offSiteTreatment?: ProjectReportedCostComponentTreatment | null;
      coProductMethod?: ProjectReportedCostCoProductMethod | null;
      equivalentFormula?: string | null;
      costBaseYear?: number | null;
      quality?: ProjectReportedCostQuality | null;
      sourceId?: string | null;
      pageOrTable?: string | null;
    }> | null;
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
    royaltiesDetail?: Array<{
      id: string; label: string; name?: string | null;
      base: 'revenue' | 'ebit' | 'ebitda' | 'quantity';
      rateType?: string | null; rate?: number | null;
      royaltyUSD?: Array<number | null>;
      source?: 'PEA' | 'PFS' | 'FS' | 'Other' | null;
      notes?: string | null;
    }> | null;
    taxesDetail?: { federalIncomeTaxUSD?: Array<number | null>; municipalRevenueTaxUSD?: Array<number | null> } | null;
  } | null;
  priceOverrides?: {
    spotPriceUSDByMetal?: Record<string, Array<number | null>>;
    auPriceUSDPerOz?: Array<number | null>;
  } | null;
};
