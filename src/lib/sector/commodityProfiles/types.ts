export type CommodityId = "gold";

export type CommodityCategory = "monetary_store_of_value" | "industrial" | "energy" | "agriculture" | "other";

export type CommodityPhase =
  | "Compression"
  | "Early Cycle"
  | "Mid Cycle"
  | "Late Cycle"
  | "Structural Bull"
  | "Structural Bear"
  | "Unknown";

export type CommodityIndicatorKey =
  | "gold_usd"
  | "gold_minus_real_yield_spread"
  | "real_yield_10y_us"
  | "usd_broad_index"
  | "usd_yoy"
  | "core_cpi_yoy_us"
  | "breakeven_10y_us";

export type CommodityStatus = "ok" | "partial" | "insufficient";

export type CommodityDriver = {
  id: string;
  label: string;
  signal: "bullish" | "bearish" | "neutral";
  weight: number;
  note?: string;
};

export type CommodityBlockScore = {
  blockId: "price_trend" | "macro_monetary" | "equity_confirmation" | "policy_narrative";
  label: string;
  score: number | null;
  confidence: number;
  status: "used" | "missing" | "not_used";
  notes?: string[];
};

export type CommodityIndicatorDiagnostic = {
  key: CommodityIndicatorKey;
  used: boolean;
  missing: boolean;
  fallbackUsed: boolean;
  score: number | null;
  valueLatest: number | null;
  percentile10y: number | null;
  asOf: string | null;
  note?: string;
};

export type CommodityDiagnostics = {
  usedIndicators: CommodityIndicatorKey[];
  missingIndicators: CommodityIndicatorKey[];
  fallbackIndicators: CommodityIndicatorKey[];
  confidenceReasons: string[];
  phaseStrength: "strong" | "moderate" | "weak";
  notes: string[];
};

export type CommodityConfidence = {
  score: number;
  tier: "high" | "medium" | "low";
  breakdown: {
    dataCompleteness: number;
    signalCoherence: number;
    fallbackPenalty: number;
  };
  reasons: string[];
};

export type CommodityScreeningAdjustment = {
  bias: "supportive" | "neutral" | "defensive" | "caution";
  notes?: string[];
  thresholdAdjustments?: {
    valuationMultipleFloorDeltaPct?: number;
    maxPositionSizeDeltaPct?: number;
  };
};

export type CommodityProfileInputIndicator = {
  key: CommodityIndicatorKey;
  valueLatest: number | null;
  percentile10y: number | null;
  score: number | null;
  change1m: number | null;
  change3m: number | null;
  yoy: number | null;
  asOf: string | null;
};

export type CommodityProfileInput = {
  commodity: CommodityId;
  asOf: string;
  indicators: Partial<Record<CommodityIndicatorKey, CommodityProfileInputIndicator>>;
  overlays: Record<string, number | null>;
  manualInputs: Record<string, string>;
  macroContext: {
    coreRegimeLabel: string | null;
    hardAssetOverlay: string | null;
    macroConfidence: number | null;
  };
};

export type CommodityProfileOutput = {
  commodity: CommodityId;
  category: CommodityCategory;
  phase: CommodityPhase;
  phaseScore: number | null;
  confidence: CommodityConfidence;
  drivers: CommodityDriver[];
  blockScores: CommodityBlockScore[];
  indicatorDiagnostics: CommodityIndicatorDiagnostic[];
  dataCompleteness: number;
  relevantOverlays: Array<{ key: string; score: number | null }>;
  screeningAdjustments: CommodityScreeningAdjustment;
  profileVersion: string;
  asOf: string;
  status: CommodityStatus;
  diagnostics: CommodityDiagnostics;
};

export type CommodityProfile = {
  commodity: CommodityId;
  category: CommodityCategory;
  requiredIndicators: CommodityIndicatorKey[];
  optionalIndicators: CommodityIndicatorKey[];
  profileVersion: string;
  compute: (input: CommodityProfileInput) => CommodityProfileOutput;
};
