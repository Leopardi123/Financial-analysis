export type MacroBlock = "A_FISCAL" | "B_MONETARY" | "C_INFLATION" | "D_CREDIBILITY";
export type SignalClass = "clear" | "speculative";
export type OverlayType = "growth" | "stress" | "hard_asset";

export type MacroIndicatorCatalogEntry = {
  indicatorId: string;
  region: string;
  block: MacroBlock;
  signalClass: SignalClass;
  title: string;
  description: string;
  inputs: string[];
  transform: "identity" | "level" | "spread" | "ratio" | "yoy" | "yoy_change" | "momentum";
  scoring: "percentile_10y";
  blockWeight: number;
  overlay?: OverlayType;
};

export type MonthlyPoint = { date: string; value: number | null };

export type MacroSeriesInput = {
  seriesKey: string;
  points: MonthlyPoint[];
};

export type MacroIndicatorSnapshot = {
  asOfDate: string;
  region: string;
  indicatorId: string;
  signalClass: SignalClass;
  sourceType: "auto" | "manual";
  valueLatest: number | null;
  percentile10y: number | null;
  score: -2 | -1 | 0 | 1 | 2 | null;
  freshnessDays: number | null;
  coverage10yPct: number;
  contribution: number | null;
  change1m?: number | null;
  change3m?: number | null;
  yoy?: number | null;
};

export type MacroDriverDirection = "rising" | "falling" | "stable" | "accelerating" | "decelerating";


export type InflationCompositeDetails = {
  compositeId: string;
  indicators: string[];
  used: Array<{ indicatorId: string; percentile10y: number }>;
  missing: string[];
};

export type InflationSplitSnapshot = {
  goodsInflationComposite: number | null;
  monetaryInflationComposite: number | null;
  actualInflationReference: number | null;
  referenceLabel: string;
  dominance: "goods" | "monetary" | "neutral";
  dominanceSpread: number | null;
  model: {
    goods: InflationCompositeDetails;
    monetary: {
      compositeId: string;
      formula: string;
      components: Array<{ component: string; seriesKey: string; weight: number; percentile10y: number | null; inverted: boolean }>;
      missing: string[];
    };
    reference: {
      indicatorId: string;
      label: string;
      missing: boolean;
    };
  };
};

export type MacroTopDriver = {
  region: string;
  indicatorId: string;
  title: string;
  block: MacroBlock;
  score: -2 | -1 | 0 | 1 | 2;
  percentile10y: number;
  contribution: number;
  direction: MacroDriverDirection;
  change1m: number | null;
  change3m: number | null;
  yoy: number | null;
  driverNote: string | null;
};

export type MacroRegimeSnapshot = {
  asOfDate: string;
  region: string;
  blockScores: Record<MacroBlock, number | null>;
  macroScoreTotal: number | null;
  macroConfidence: number;
  coreRegimeLabel:
    | "MonetaryDominance"
    | "Balanced"
    | "FiscalPressureBuilding"
    | "FiscalDominanceRisk"
    | "DataInsufficient";
  growthOverlay: "Weak" | "Neutral" | "Strong";
  stressOverlay: "Low" | "Medium" | "High";
  hardAssetOverlay: "Weak" | "Neutral" | "Strong";
  clearSignalStrength: number | null;
  speculativeSignalStrength: number | null;
  topDrivers: MacroTopDriver[];
  regimeExplanation: {
    title: string;
    summary: string;
    driverHighlights: string[];
  };
  inflationSplit?: InflationSplitSnapshot | null;
};
