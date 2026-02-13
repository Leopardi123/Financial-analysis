export type UniverseType = "all" | "watchlist" | "sector" | "manual";

export type MetricState = "ok" | "manual" | "missing";

export type MetricResult = {
  key: string;
  label: string;
  value: number | null;
  state: MetricState;
  note?: string;
};

export type CompanySnapshot = {
  ticker: string;
  years: number[];
  income: Record<string, Array<number | null>>;
  balance: Record<string, Array<number | null>>;
  cashflow: Record<string, Array<number | null>>;
  profile?: Record<string, unknown> | null;
  manual?: Record<string, number>;
};

export type PresetScore = {
  matched: boolean;
  score: number;
  includeReasons: string[];
  excludeReasons: string[];
  metrics: MetricResult[];
};

export type PresetDefinition = {
  id: string;
  name: string;
  category: string;
  description: string;
  checks: string[];
  ignores: string[];
  requiredFields: string[];
  optionalFields: string[];
  defaults?: Record<string, number>;
  evaluate: (snapshot: CompanySnapshot, params: Record<string, number>) => PresetScore;
  fallback: string;
};

export type ScreeningResult = {
  ticker: string;
  presetId: string;
  matched: boolean;
  score: number;
  includeReasons: string[];
  excludeReasons: string[];
  metrics: MetricResult[];
};
