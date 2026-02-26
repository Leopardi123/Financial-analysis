export type TakeJurisdictionLevel =
  | 'contractual'
  | 'national'
  | 'provincial_state'
  | 'municipal'
  | 'other';

export type TakeBaseType = 'REVENUE' | 'BY_METAL_REVENUE' | 'PAYABLE_QTY';

export type TakeRateType = 'FIXED' | 'TIERED_REVENUE';

export type TakeItemMVI = {
  id: string;
  jurisdictionLevel: TakeJurisdictionLevel;
  metals: string[];
  start_t?: number | null;
  end_t?: number | null;
  baseType: TakeBaseType;
  rateType: TakeRateType;
  rateFixed?: number | null;
  tiers?: Array<{ thresholdUSD: number; rate: number }> | null;
  cap?: {
    capType: 'none' | 'revenue' | 'payableQty';
    capAmountUSD?: number | null;
    capAmountQty?: number | null;
  } | null;
  enabled?: boolean | null;
};

export type ProjectTakeMVIInput = {
  masterN: number;
  grossRevenueUSD: Array<number | null>;
  byMetalRevenueUSD?: Record<string, Array<number | null>> | null;
  payableQtyByMetal?: Record<string, Array<number | null>> | null;
  items: TakeItemMVI[];
};

export type ProjectTakeMVIOutput = {
  totalTakeUSD: Array<number | null>;
  netRevenueAfterTakeUSD: Array<number | null>;
  takeByItemUSD: Record<string, Array<number | null>>;
};
