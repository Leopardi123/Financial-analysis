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
  transform: "identity" | "spread" | "yoy" | "momentum";
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
  topDrivers: Array<{ indicatorId: string; contribution: number }>;
};
