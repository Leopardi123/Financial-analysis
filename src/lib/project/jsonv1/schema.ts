import type { StreamMVIConfig } from '../streams/types.ts';
import type { TakeItemMVI } from '../take/types.ts';

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
  };

  economics: {
    taxRate?: number;
  };

  series: {
    capexUSD: Array<number | null>;
    operatingCostsUSD: Array<number | null>;
    sustainingCapexUSD: Array<number | null>;
    siteGandA_USD: Array<number | null>;
    royaltiesUSD?: Array<number | null>;
    reclamationUSD: Array<number | null>;
    byproductCreditsUSD?: Array<number | null>;
  };

  metals: {
    payableQtyByMetal: Record<string, Array<number | null>>;
    spotPriceUSDByMetal: Record<string, Array<number | null>>;
    auPriceUSDPerOz: Array<number | null>;
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
  } | null;
};
