export type StreamPurchasePriceRule =
  | { kind: 'FIXED_USD_PER_UNIT'; value: number }
  | { kind: 'PCT_OF_SPOT'; value: number }
  | {
      kind: 'CUMULATIVE_QTY_TIERED_PCT_OF_SPOT';
      tiers: Array<{ upToCumulativeQty: number | null; value: number }>;
    };

export type StreamMVIConfig = {
  streamMetal?: string;

  /** Legacy/default delivery rule: a fixed fraction of the input payable quantity. */
  streamPctOfPayable?: number;
  /** Source-backed direct deliveries, e.g. a technical-report annual stream-delivery row. */
  deliveryMode?: 'PCT_OF_PAYABLE' | 'DIRECT_QTY_SERIES';
  deliveredQtyByPeriod?: Array<number | null>;
  /**
   * PRE_STREAM means input payable includes ounces/units delivered to the streamer.
   * POST_STREAM means input payable is the directly reported retained payable quantity;
   * pre-stream payable is reconstructed only inside the revenue engine as retained + delivered.
   */
  inputPayableBasis?: 'PRE_STREAM' | 'POST_STREAM';

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

  sourceId?: string | null;
  pageOrTable?: string | null;
  notes?: string | null;
};

export type StreamMVIInput = {
  masterN: number;
  payableQty: (number | null)[];
  spotPriceUSDPerUnit: (number | null)[];
  config: StreamMVIConfig;
};

export type StreamMVIOutput = {
  /** Payable quantity before the stream economic deduction. */
  preStreamPayableQty: (number | null)[];
  deliveredQty: (number | null)[];
  /** Retained/payable quantity sold at spot after stream deliveries. */
  effectivePayableQty: (number | null)[];
  /** Effective average purchase price for the delivered quantity in each period. */
  purchasePriceUSDPerUnit: (number | null)[];
  /** Cash paid by the streamer to the project. */
  streamPurchaseRevenueUSD: (number | null)[];
  /** Economic value transferred to the streamer = spot value less streamer purchase cash. */
  streamTakeUSD: (number | null)[];
  remainingCapEnd: number | null;
};
