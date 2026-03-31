export type UniverseType = "all" | "watchlist" | "sector" | "manual";
export type ScreeningMode = "simple" | "advanced";

export type ScreeningFieldGroup = "price" | "fundamentals" | "risk" | "mining" | "manual";
export type ScreeningFieldType = "number" | "string" | "boolean";
export type ScreeningInputKind = "numeric" | "percent_like" | "ratio" | "categorical";

export type ScreeningFieldDef = {
  key: string;
  label: string;
  group: ScreeningFieldGroup;
  dataType: ScreeningFieldType;
  unit: "percent" | "ratio" | "absolute" | "state";
  inputKind: ScreeningInputKind;
  allowedOperators?: RuleOperator[];
  enumValues?: string[];
  valueFormatHint?: string;
  source: string;
  simple: boolean;
  advanced: boolean;
  description?: string;
  interpretation?: string;
  example?: string;
};

export type MetricState = "ok" | "manual" | "missing";

export type MetricResult = {
  key: string;
  label: string;
  value: number | string | null;
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
  price?: Record<string, unknown> | null;
  corporateSnapshot?: Record<string, unknown> | null;
};

export type RuleOperator = ">" | ">=" | "<" | "<=" | "==" | "!=" | "in";

export type RuleValue = number | string | Array<number | string> | { param: string };

export type ScreenRule = {
  id: string;
  field: string;
  operator: RuleOperator;
  value: RuleValue;
  label?: string;
  weight?: number;
  group?: "mustHave" | "niceToHave" | "excludeIf";
};

export type ScreenDefinition = {
  id: string;
  name: string;
  category: string;
  description: string;
  checks: string[];
  ignores: string[];
  requiredFields: string[];
  optionalFields: string[];
  fallback: string;
  defaults?: Record<string, number>;
  rules: {
    mustHave: ScreenRule[];
    niceToHave?: ScreenRule[];
    excludeIf?: ScreenRule[];
  };
};

export type RuleEvaluation = {
  rule: ScreenRule;
  fieldLabel: string;
  value: number | string | boolean | null;
  passed: boolean;
  reason: string;
};

export type ScreeningResult = {
  ticker: string;
  presetId: string;
  matched: boolean;
  score: number;
  evaluationStatus: "passed" | "failed" | "not_evaluated";
  missingRequiredFields: string[];
  includeReasons: string[];
  excludeReasons: string[];
  metrics: MetricResult[];
  ruleResults: RuleEvaluation[];
};
