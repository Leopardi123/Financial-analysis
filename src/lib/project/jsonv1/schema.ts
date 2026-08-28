import type { StreamMVIConfig } from '../streams/types.ts';

export type QtyUnit = 'toz' | 'g' | 'kg' | 'lb' | 'tonne' | 'short_ton' | 'long_ton';

export type PriceUnit = 'USD_per_toz' | 'USD_per_lb' | 'USD_per_tonne';

export type ProjectReportedCostMetric =
  | 'AISC_AU_USD_PER_TOZ'
  | 'AISC_AGEQ_USD_PER_TOZ'
  | 'C1_CU_USD_PER_LB'
  | 'AISC_ZNEQ_USD_PER_LB'
  | 'C1_NI_USD_PER_LB'
  | 'AISC_NI_USD_PER_LB'
  | 'AISC_PGM3E_USD_PER_TOZ';

export type ProjectReportedCostBasis =
  | 'S_AND_P_CO_PRODUCT_AISC_AU'
  | 'JUANICIPIO_REPORTED_AGEQ_AISC_MIXED_Q1_EVIDENCE'
  | 'S_AND_P_CO_PRODUCT_C1_CU'
  | 'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS'
  | 'JAGUAR_NI_C1_MINE_SITE_GA'
  | 'VALTERRA_PGM_3E_AISC_SOLD';

export type ProjectJsonV1 = {
  version: 'project_json_v2';

  meta?: {
    projectId?: string;
    projectName?: string;
    currency?: 'USD';
    notes?: string;
  };

  time: {
    masterN: number;
    productionStartPeriod: number;
    productionStartYear: number;
  };

  economics: {
    taxRate?: number | null;
  };

  equity?: {
    fdExtraShares?: number | null;
    fdNotes?: string | null;
  };

  series: {
    capexUSD: Array<number | null>;
    operatingCostsUSD: Array<number | null>;
    sustainingCapexUSD: Array<number | null>;
    siteGandA_USD: Array<number | null>;
    // Optional depreciation & amortization series for EBITDA display.
    depreciationUSD?: Array<number | null>;
    workingCapitalDeltaUSD?: Array<number | null>;
    royaltiesUSD?: Array<number | null>;
    reclamationUSD: Array<number | null>;
    byproductCreditsUSD?: Array<number | null>;
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
    capacity: {
      throughputUnit: 'tpd' | 'tpa' | null;
      nameplateThroughput: number | null;
      utilizationPct?: number | null;
    };

    oreMilledTonnes?: Array<number | null>;
    oreMinedTonnes?: Array<number | null>;
    oreTonnageUnit?: 'tonne' | 'short_ton' | 'long_ton' | null;
    // Per-period head grade by metal (unit declared in gradeUnitByMetal).
    gradeByMetal?: Record<string, Array<number | null>>;
    gradeUnitByMetal?: Record<string, 'gpt' | 'pct' | 'ozpt' | string>;
    // Per-period metallurgical recovery by metal (0..1 or 0..100 accepted).
    recoveryPctByMetal?: Record<string, Array<number | null>>;
  } | null;

  economicsBreakdown?: {
    meta?: {
      defaultSource?: 'PEA' | 'PFS' | 'FS' | 'Other' | null;
      /** Nominal USD cost basis used for the operating/offsite cost estimate. */
      costBaseYear?: number | null;
      notes?: string | null;
    } | null;
    /**
     * Prefer a directly reported AISC/C1 when the report explicitly supports
     * the same cost definition as the Tier benchmark. The definition basis is
     * mandatory and is never inferred from the metric name.
     */
    reportedCostMetrics?: Array<{
      metric: ProjectReportedCostMetric;
      basisId: ProjectReportedCostBasis;
      value: number;
      unit: 'USD/lb' | 'USD/toz';
      costBaseYear: number;
      sourceId: string;
      pageOrTable: string;
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
      id: string;
      label: string;
      name?: string | null;
      base: 'revenue' | 'ebit' | 'ebitda' | 'quantity';
      rateType?: string | null;
      rate?: number | null;
      royaltyUSD?: Array<number | null>;
      source?: 'PEA' | 'PFS' | 'FS' | 'Other' | null;
      notes?: string | null;
    }> | null;
    taxesDetail?: {
      federalIncomeTaxUSD?: Array<number | null>;
      municipalRevenueTaxUSD?: Array<number | null>;
    } | null;
  } | null;

  /**
   * Hard PEA/PFS/FS reconciliation evidence. VERIFIED is derived by the Tier
   * guard; project JSON cannot assert its own verification status.
   */
  reconciliation?: {
    report: {
      sourceId: string;
      pageOrTable: string;
      discountRate: number;
      npv: number;
      npvCurrency: string;
      irrAfterTax: number;
      priceDeckByMetal: Record<string, { value: number; unit: string }>;
    };
    jsonCheck: {
      npvAtReportDiscountRate: number;
      irrAfterTax: number;
    };
    checks: {
      periodMappingVerified: boolean;
      capexPlacementVerified: boolean;
      closureWorkingCapitalVerified: boolean;
      reportPricesAndAssumptionsVerified: boolean;
      cashFlowDefinitionVerified: boolean;
    };
    toleranceRelative?: number;
    verifiedAtUtc?: string;
  } | null;

  priceOverrides?: {
    spotPriceUSDByMetal?: Record<string, Array<number | null>>;
    auPriceUSDPerOz?: Array<number | null>;
  } | null;
};
