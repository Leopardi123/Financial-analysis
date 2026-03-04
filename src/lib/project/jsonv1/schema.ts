import type { StreamMVIConfig } from '../streams/types.ts';

export type QtyUnit = 'toz' | 'g' | 'kg' | 'lb' | 'tonne' | 'short_ton' | 'long_ton';

export type PriceUnit = 'USD_per_toz' | 'USD_per_lb' | 'USD_per_tonne';

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
    periodEndDatesUtc?: Array<string>;
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
      notes?: string | null;
    } | null;
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

  priceOverrides?: {
    spotPriceUSDByMetal?: Record<string, Array<number | null>>;
    auPriceUSDPerOz?: Array<number | null>;
  } | null;
};
