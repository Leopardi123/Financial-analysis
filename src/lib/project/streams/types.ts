export type StreamPurchasePriceRule =
  | { kind: 'FIXED_USD_PER_UNIT'; value: number }
  | { kind: 'PCT_OF_SPOT'; value: number };

export type StreamMVIConfig = {
  streamMetal?: string;
  streamPctOfPayable: number;
  start_t?: number | null;
  end_t?: number | null;

  // Legacy and JSON-v1-compatible cap field
  deliveryCapTotalQty?: number | null;
  // MVI hardened name
  deliveryCapQty?: number | null;

  // Legacy purchase shape
  purchasePrice?: StreamPurchasePriceRule;

  // MVI hardened purchase shape
  purchasePriceRule?: 'FIXED_USD_PER_UNIT' | 'PCT_OF_SPOT';
  fixedPriceUSDPerUnit?: number;
  pctOfSpot?: number;
};

export type StreamMVIInput = {
  masterN: number;
  payableQty: (number | null)[];
  spotPriceUSDPerUnit: (number | null)[];
  config: StreamMVIConfig;
};

export type StreamMVIOutput = {
  deliveredQty: (number | null)[];
  effectivePayableQty: (number | null)[];
  streamTakeUSD: (number | null)[];
  remainingCapEnd: number | null;
};
