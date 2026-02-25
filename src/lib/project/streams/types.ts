export type StreamPurchasePriceRule =
  | { kind: 'FIXED_USD_PER_UNIT'; value: number }
  | { kind: 'PCT_OF_SPOT'; value: number };

export type StreamMVIConfig = {
  streamPctOfPayable: number;
  start_t?: number | null;
  end_t?: number | null;
  deliveryCapTotalQty?: number | null;
  purchasePrice: StreamPurchasePriceRule;
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
