import {
  QUALITY_MULTIPLE_POLICY,
  type CorporateQualityDiagnosticCode,
  type CorporateQualityMultipleInput,
  type CorporateQualityMultipleOutput,
  type CorporateQualityOverlayBasis,
} from './types.ts';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const strictSum = (values: Array<number | null>): number | null =>
  values.every(finite) ? (values as number[]).reduce((sum, value) => sum + value, 0) : null;

function assertInputLengths(input: CorporateQualityMultipleInput): void {
  const length = input.calendarYears.length;
  const series = {
    ebitdaUSD_total: input.ebitdaUSD_total,
    revenueUSD_total: input.revenueUSD_total,
    sustainingCapexUSD_total: input.sustainingCapexUSD_total,
    netCashTarget: input.netCashTarget,
    sharesPostFinancing: input.sharesPostFinancing,
  };
  for (const [name, values] of Object.entries(series)) {
    if (values.length !== length) throw new Error(`Corporate multiple contrast ${name} length must equal calendarYears length`);
  }
  if (input.calendarYears.some((year) => !Number.isInteger(year))) {
    throw new Error('Corporate multiple contrast calendarYears must contain integers');
  }
}

export function bridgeCorporateMultipleToEquity(args: {
  selectedEbitdaUSD: number | null;
  fxUSDToTarget: number | null;
  lowMultiple: number | null;
  midMultiple: number | null;
  highMultiple: number | null;
  netCashTarget: number | null;
  sharesPostFinancing: number | null;
}): CorporateQualityOverlayBasis {
  const enterprise = (multiple: number | null): number | null =>
    finite(args.selectedEbitdaUSD) && finite(args.fxUSDToTarget) && finite(multiple)
      ? args.selectedEbitdaUSD * args.fxUSDToTarget * multiple
      : null;
  const equity = (value: number | null): number | null =>
    finite(value) && finite(args.netCashTarget) ? value + args.netCashTarget : null;
  const perShare = (value: number | null): number | null =>
    finite(value) && finite(args.sharesPostFinancing) && args.sharesPostFinancing > 0
      ? value / args.sharesPostFinancing
      : null;
  const enterpriseValueLowTarget = enterprise(args.lowMultiple);
  const enterpriseValueMidTarget = enterprise(args.midMultiple);
  const enterpriseValueHighTarget = enterprise(args.highMultiple);
  const equityValueLowTarget = equity(enterpriseValueLowTarget);
  const equityValueMidTarget = equity(enterpriseValueMidTarget);
  const equityValueHighTarget = equity(enterpriseValueHighTarget);
  return {
    enterpriseValueLowTarget, enterpriseValueMidTarget, enterpriseValueHighTarget,
    equityValueLowTarget, equityValueMidTarget, equityValueHighTarget,
    valuePerShareLow: perShare(equityValueLowTarget),
    valuePerShareMid: perShare(equityValueMidTarget),
    valuePerShareHigh: perShare(equityValueHighTarget),
  };
}

function remainingYearsAdjustment(years: number): number {
  if (years < 3) return -1.5;
  if (years <= 4) return -1;
  if (years <= 7) return -0.5;
  if (years <= 11) return 0;
  if (years <= 15) return 0.5;
  if (years <= 20) return 0.75;
  return 1;
}

function frontLoadingAdjustment(value: number): number {
  if (value < 0.20) return -0.5;
  if (value < 0.30) return -0.25;
  if (value < 0.55) return 0;
  if (value < 0.70) return 0.25;
  if (value <= 0.85) return 0;
  return -0.25;
}

function stabilityAdjustment(value: number): number {
  if (value < 0.10) return 0.5;
  if (value < 0.20) return 0.25;
  if (value < 0.35) return 0;
  if (value < 0.50) return -0.25;
  if (value <= 0.75) return -0.5;
  return -0.75;
}

function sustainingIntensityAdjustment(value: number): number {
  if (value < 0.05) return 0.5;
  if (value < 0.10) return 0.25;
  if (value < 0.20) return 0;
  if (value < 0.30) return -0.25;
  if (value <= 0.45) return -0.5;
  return -0.75;
}

function marginAdjustment(value: number): number {
  if (value < 0) return -1;
  if (value < 0.15) return -0.75;
  if (value < 0.25) return -0.5;
  if (value < 0.35) return 0;
  if (value < 0.45) return 0.25;
  if (value <= 0.55) return 0.5;
  return 0.75;
}

function addDiagnostic(list: CorporateQualityDiagnosticCode[], code: CorporateQualityDiagnosticCode): void {
  if (!list.includes(code)) list.push(code);
}

export function computeCorporateQualityMultiples(input: CorporateQualityMultipleInput): CorporateQualityMultipleOutput {
  assertInputLengths(input);
  const rows = input.calendarYears.map((calendarYear, t) => {
    const diagnostics: CorporateQualityDiagnosticCode[] = [];
    const remainingPeriods = input.calendarYears.length - t;
    const windowLength = remainingPeriods >= QUALITY_MULTIPLE_POLICY.fullWindowLength
      ? QUALITY_MULTIPLE_POLICY.fullWindowLength
      : remainingPeriods;
    const shortWindow = remainingPeriods >= QUALITY_MULTIPLE_POLICY.minimumWindowLength
      && remainingPeriods < QUALITY_MULTIPLE_POLICY.fullWindowLength;
    addDiagnostic(diagnostics, remainingPeriods >= QUALITY_MULTIPLE_POLICY.fullWindowLength ? 'FULL_WINDOW'
      : shortWindow ? 'SHORT_WINDOW' : 'INSUFFICIENT_REMAINING_PERIODS');
    const windowEnd = t + windowLength;
    const ebitdaWindow = input.ebitdaUSD_total.slice(t, windowEnd);
    const revenueWindow = input.revenueUSD_total.slice(t, windowEnd);
    const sustainingWindow = input.sustainingCapexUSD_total.slice(t, windowEnd);
    const ebitdaTail = input.ebitdaUSD_total.slice(t);

    if (ebitdaWindow.some((value) => !finite(value)) || ebitdaTail.some((value) => !finite(value))) addDiagnostic(diagnostics, 'NULL_EBITDA');
    if (revenueWindow.some((value) => !finite(value))) addDiagnostic(diagnostics, 'NULL_REVENUE');
    if (sustainingWindow.some((value) => !finite(value))) addDiagnostic(diagnostics, 'NULL_SUSTAINING_CAPEX');
    if (sustainingWindow.some((value) => finite(value) && value < 0)) addDiagnostic(diagnostics, 'NEGATIVE_SUSTAINING_CAPEX');

    const activeIndices = input.calendarYears
      .map((_, index) => index)
      .slice(t)
      .filter((index) => finite(input.revenueUSD_total[index]) && input.revenueUSD_total[index] > 0
        && finite(input.ebitdaUSD_total[index]) && input.ebitdaUSD_total[index] > 0);
    const remainingActiveEconomicYears = activeIndices.length > 0 ? activeIndices.length : null;
    const economicEndIndex = activeIndices.length > 0 ? activeIndices[activeIndices.length - 1] : null;
    const economicEndYear = economicEndIndex === null ? null : input.calendarYears[economicEndIndex];
    const remainingEconomicSpanYears = economicEndYear === null ? null : economicEndYear - calendarYear + 1;
    const economicGapYears = remainingEconomicSpanYears === null || remainingActiveEconomicYears === null
      ? null : remainingEconomicSpanYears - remainingActiveEconomicYears;
    if (remainingActiveEconomicYears === null) addDiagnostic(diagnostics, 'NO_ACTIVE_ECONOMIC_YEARS');

    const eligibleWindow = remainingPeriods >= QUALITY_MULTIPLE_POLICY.minimumWindowLength;
    const ebitdaSum = eligibleWindow ? strictSum(ebitdaWindow) : null;
    const forwardAverageEbitdaUSD = ebitdaSum === null ? null : ebitdaSum / windowLength;
    if (eligibleWindow && forwardAverageEbitdaUSD !== null && forwardAverageEbitdaUSD <= 0) addDiagnostic(diagnostics, 'NON_POSITIVE_EBITDA_MEAN');

    const positiveTailSum = strictSum(ebitdaTail.map((value) => finite(value) ? Math.max(value, 0) : null));
    const negativeTailSum = strictSum(ebitdaTail.map((value) => finite(value) ? Math.min(value, 0) : null));
    if (positiveTailSum !== null && positiveTailSum <= 0) addDiagnostic(diagnostics, 'NON_POSITIVE_POSITIVE_EBITDA_DENOMINATOR');
    const negativeEbitdaTailShare = positiveTailSum !== null && positiveTailSum > 0 && negativeTailSum !== null
      ? Math.abs(negativeTailSum) / positiveTailSum : null;
    const positiveWindowSum = eligibleWindow
      ? strictSum(ebitdaWindow.map((value) => finite(value) ? Math.max(value, 0) : null)) : null;
    let frontLoading5Y = positiveWindowSum !== null && positiveTailSum !== null && positiveTailSum > 0
      ? positiveWindowSum / positiveTailSum : null;
    if (frontLoading5Y !== null && (frontLoading5Y < 0 || frontLoading5Y > 1)) {
      addDiagnostic(diagnostics, 'INVALID_FRONT_LOADING_INVARIANT');
      frontLoading5Y = null;
    }

    const ebitdaCv5Y = eligibleWindow && forwardAverageEbitdaUSD !== null && forwardAverageEbitdaUSD > 0
      ? Math.sqrt((ebitdaWindow as number[]).reduce((sum, value) => sum + ((value - forwardAverageEbitdaUSD) ** 2), 0) / windowLength) / forwardAverageEbitdaUSD
      : null;
    const sustainingSum = eligibleWindow ? strictSum(sustainingWindow) : null;
    const sustainingIntensity5Y = sustainingSum !== null
      && !diagnostics.includes('NEGATIVE_SUSTAINING_CAPEX')
      && positiveWindowSum !== null && positiveWindowSum > 0
      ? sustainingSum / positiveWindowSum : null;
    const revenueSum = eligibleWindow ? strictSum(revenueWindow) : null;
    if (eligibleWindow && revenueSum !== null && revenueSum <= 0) addDiagnostic(diagnostics, 'NON_POSITIVE_REVENUE_DENOMINATOR');
    const ebitdaMargin5Y = ebitdaSum !== null && revenueSum !== null && revenueSum > 0 ? ebitdaSum / revenueSum : null;
    if (ebitdaMargin5Y !== null && ebitdaMargin5Y > 1) addDiagnostic(diagnostics, 'EBITDA_MARGIN_ABOVE_ONE');

    const remainingEconomicYearsAdjustment = remainingActiveEconomicYears === null ? null : remainingYearsAdjustment(remainingActiveEconomicYears);
    const frontAdjustment = frontLoading5Y === null ? null : frontLoadingAdjustment(frontLoading5Y);
    const stability = ebitdaCv5Y === null ? null : stabilityAdjustment(ebitdaCv5Y);
    const sustainingAdjustment = sustainingIntensity5Y === null ? null : sustainingIntensityAdjustment(sustainingIntensity5Y);
    const margin = ebitdaMargin5Y === null ? null : marginAdjustment(ebitdaMargin5Y);
    const adjustments = [remainingEconomicYearsAdjustment, frontAdjustment, stability, sustainingAdjustment, margin];
    const rawQualityMultiple = adjustments.every(finite)
      ? QUALITY_MULTIPLE_POLICY.base + (adjustments as number[]).reduce((sum, value) => sum + value, 0) : null;
    const qualityMidMultiple = rawQualityMultiple === null ? null
      : Math.min(QUALITY_MULTIPLE_POLICY.maximum, Math.max(QUALITY_MULTIPLE_POLICY.minimum, rawQualityMultiple));
    const qualityLowMultiple = qualityMidMultiple === null ? null
      : Math.max(QUALITY_MULTIPLE_POLICY.minimum, qualityMidMultiple - QUALITY_MULTIPLE_POLICY.band);
    const qualityHighMultiple = qualityMidMultiple === null ? null
      : Math.min(QUALITY_MULTIPLE_POLICY.maximum, qualityMidMultiple + QUALITY_MULTIPLE_POLICY.band);
    const bridge = (selectedEbitdaUSD: number | null) => bridgeCorporateMultipleToEquity({
      selectedEbitdaUSD, fxUSDToTarget: input.fxUSDToTarget,
      lowMultiple: qualityLowMultiple, midMultiple: qualityMidMultiple, highMultiple: qualityHighMultiple,
      netCashTarget: input.netCashTarget[t], sharesPostFinancing: input.sharesPostFinancing[t],
    });

    return {
      calendarYear, annualEbitdaUSD: finite(input.ebitdaUSD_total[t]) ? input.ebitdaUSD_total[t] : null,
      forwardAverageEbitdaUSD, remainingActiveEconomicYears, economicEndYear, remainingEconomicSpanYears, economicGapYears,
      frontLoading5Y, negativeEbitdaTailShare, ebitdaCv5Y, sustainingIntensity5Y, ebitdaMargin5Y,
      remainingEconomicYearsAdjustment, frontLoadingAdjustment: frontAdjustment, stabilityAdjustment: stability,
      sustainingIntensityAdjustment: sustainingAdjustment, marginAdjustment: margin,
      rawQualityMultiple, qualityLowMultiple, qualityMidMultiple, qualityHighMultiple,
      annualBasis: bridge(finite(input.ebitdaUSD_total[t]) ? input.ebitdaUSD_total[t] : null),
      forwardAverageBasis: bridge(forwardAverageEbitdaUSD), shortWindow, windowLength,
      windowStartYear: calendarYear, windowEndYear: input.calendarYears[windowEnd - 1],
      qualityStatus: qualityMidMultiple === null ? 'NOT_COMPUTABLE' as const : 'COMPUTABLE' as const,
      qualityDiagnostics: diagnostics,
    };
  });
  return { policy: QUALITY_MULTIPLE_POLICY, rows };
}
