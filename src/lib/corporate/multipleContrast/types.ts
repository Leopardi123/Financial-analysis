export const QUALITY_MULTIPLE_POLICY = {
  base: 6,
  minimum: 3,
  maximum: 10,
  band: 1,
  fullWindowLength: 5,
  minimumWindowLength: 3,
} as const;

export type CorporateQualityDiagnosticCode =
  | 'FULL_WINDOW'
  | 'SHORT_WINDOW'
  | 'INSUFFICIENT_REMAINING_PERIODS'
  | 'NO_ACTIVE_ECONOMIC_YEARS'
  | 'NULL_EBITDA'
  | 'NULL_REVENUE'
  | 'NULL_SUSTAINING_CAPEX'
  | 'NON_POSITIVE_EBITDA_MEAN'
  | 'NON_POSITIVE_POSITIVE_EBITDA_DENOMINATOR'
  | 'NON_POSITIVE_REVENUE_DENOMINATOR'
  | 'NEGATIVE_SUSTAINING_CAPEX'
  | 'INVALID_FIVE_YEAR_EBITDA_SHARE_INVARIANT'
  | 'EBITDA_MARGIN_ABOVE_ONE';

export type CorporateQualityStatus = 'COMPUTABLE' | 'NOT_COMPUTABLE';

export type CorporateQualityOverlayBasis = {
  enterpriseValueLowTarget: number | null;
  enterpriseValueMidTarget: number | null;
  enterpriseValueHighTarget: number | null;
  equityValueLowTarget: number | null;
  equityValueMidTarget: number | null;
  equityValueHighTarget: number | null;
  valuePerShareLow: number | null;
  valuePerShareMid: number | null;
  valuePerShareHigh: number | null;
};

export type CorporateQualityMultipleRow = {
  calendarYear: number;
  annualEbitdaUSD: number | null;
  forwardAverageEbitdaUSD: number | null;
  remainingActiveEconomicYears: number | null;
  economicEndYear: number | null;
  remainingEconomicSpanYears: number | null;
  economicGapYears: number | null;
  peakPositiveEbitda: number | null;
  effectiveEconomicYears: number | null;
  actualFiveYearEbitdaShare: number | null;
  expectedFiveYearEbitdaShare: number | null;
  fiveYearEbitdaConcentrationDeviation: number | null;
  positiveRemainingEbitda: number | null;
  positiveEbitdaFirstFiveYears: number | null;
  negativeEbitdaTailShare: number | null;
  ebitdaCv5Y: number | null;
  sustainingIntensity5Y: number | null;
  ebitdaMargin5Y: number | null;
  effectiveEconomicYearsAdjustment: number | null;
  fiveYearEbitdaConcentrationAdjustment: number | null;
  stabilityAdjustment: number | null;
  sustainingIntensityAdjustment: number | null;
  marginAdjustment: number | null;
  durationContextFactor: number | null;
  originalStabilityAdjustment: number | null;
  durationAdjustedStabilityAdjustment: number | null;
  originalSustainingAdjustment: number | null;
  durationAdjustedSustainingAdjustment: number | null;
  originalMarginAdjustment: number | null;
  durationAdjustedMarginAdjustment: number | null;
  rawQualityMultiple: number | null;
  qualityLowMultiple: number | null;
  qualityMidMultiple: number | null;
  qualityHighMultiple: number | null;
  annualBasis: CorporateQualityOverlayBasis;
  forwardAverageBasis: CorporateQualityOverlayBasis;
  shortWindow: boolean;
  fullWindow: boolean;
  windowLength: number;
  windowStartYear: number;
  windowEndYear: number;
  qualityStatus: CorporateQualityStatus;
  qualityDiagnostics: CorporateQualityDiagnosticCode[];
};

export type CorporateQualityMultipleInput = {
  calendarYears: number[];
  ebitdaUSD_total: Array<number | null>;
  revenueUSD_total: Array<number | null>;
  sustainingCapexUSD_total: Array<number | null>;
  netCashTarget: Array<number | null>;
  sharesPostFinancing: Array<number | null>;
  fxUSDToTarget: number | null;
};

export type CorporateQualityMultipleOutput = {
  policy: typeof QUALITY_MULTIPLE_POLICY;
  rows: CorporateQualityMultipleRow[];
};
