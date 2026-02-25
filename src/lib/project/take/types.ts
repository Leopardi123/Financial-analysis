export type TakeRateFixed = {
  rateType: 'FIXED';
  value: number;
};

export type TakeRateTiered = {
  rateType: 'TIERED';
  thresholdType: 'revenue';
  tiers: Array<{
    thresholdValue: number;
    rate: number;
  }>;
};

export type TakeBase =
  | {
      baseType: 'REVENUE';
      metal?: string | null;
    }
  | {
      baseType: 'OPERATING_PROFIT';
    };

export type TakeItemMVI = {
  id: string;
  appliesTo?: {
    metals?: string[];
    start_t?: number | null;
    end_t?: number | null;
  };
  base: TakeBase;
  rate: TakeRateFixed | TakeRateTiered;
};

export type ProjectTakeMVIInput = {
  masterN: number;
  grossRevenueUSD: (number | null)[];
  byMetalRevenueUSD?: Record<string, (number | null)[]> | null;
  operatingProfitUSD?: (number | null)[] | null;
  items: TakeItemMVI[];
};

export type ProjectTakeMVIOutput = {
  totalTakeUSD: (number | null)[];
  netRevenueAfterTakeUSD: (number | null)[];
  takeByItemUSD: Record<string, (number | null)[]>;
};
