import type { StreamMVIConfig } from '../streams/types.ts';
import type { TakeItemMVI } from '../take/types.ts';

export type QtyUnit = 'toz' | 'g' | 'kg' | 'lb' | 'tonne' | 'short_ton' | 'long_ton';

export type PriceUnit = 'USD_per_toz' | 'USD_per_lb' | 'USD_per_tonne';

export type ProjectJsonV1 = {
  version: 'project_json_v1';

  meta?: {
    projectId?: string;
    projectName?: string;
    currency?: 'USD';
    notes?: string;
  };

  time: {
    masterN: number;
    productionStartPeriod: number;
    periodEndDatesUtc?: Array<string>;
  };

  economics: {
    taxRate?: number;
  };

  series: {
    capexUSD: Array<number | null>;
    operatingCostsUSD: Array<number | null>;
    sustainingCapexUSD: Array<number | null>;
    siteGandA_USD: Array<number | null>;
    workingCapitalDeltaUSD?: Array<number | null>;
    royaltiesUSD?: Array<number | null>;
    reclamationUSD: Array<number | null>;
    byproductCreditsUSD?: Array<number | null>;
  };

  metals: {
    payableQtyByMetal: Record<string, Array<number | null>>;
    payableQtyUnitByMetal: Record<string, QtyUnit>;
    priceKeyByMetal: Record<string, string>;
    auPriceKey: string;
    spotPriceUSDByMetal?: Record<string, Array<number | null>>;
    spotPriceUnitByMetal?: Record<string, PriceUnit>;
    auPriceUSDPerOz?: Array<number | null>;
  };

  streamsByMetal?: Record<string, StreamMVIConfig> | null;

  takeItems?: Array<TakeItemMVI> | null;

  operations?: {
    capacity: {
      throughputUnit: 'tpd' | 'tpa';
      nameplateThroughput: number;
      utilizationPct?: number | null;
    };

    oreMilledTonnes?: Array<number | null>;
    oreMinedTonnes?: Array<number | null>;
    oreTonnageUnit?: 'tonne' | 'short_ton' | 'long_ton' | null;
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
      base: 'revenue' | 'ebit' | 'ebitda' | 'quantity';
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
