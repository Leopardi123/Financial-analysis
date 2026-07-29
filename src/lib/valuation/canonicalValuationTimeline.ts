export type NullableNumber = number | null;

export type ValuationPhase = 'today' | 'construction' | 'production-start' | 'operating' | 'closure';

export type ProjectContribution = {
  projectId: string;
  fcffUSD: NullableNumber;
};

export type ValuationPeriodState = {
  periodIndex: number;
  calendarYear: number;
  periodStartDate: string | null;
  periodEndDate: string | null;
  phase: ValuationPhase;
  isTodayPeriod: boolean;
  isProjectStartPeriod: boolean;
  isConstructionPeriod: boolean;
  isProductionStartPeriod: boolean;
  isOperatingPeriod: boolean;
  isClosurePeriod: boolean;
  discountExponentFromToday: number;
  discountFactorFromToday: NullableNumber;
  fcffUSD: NullableNumber;
  discountedFcffFromTodayUSD: NullableNumber;
  remainingUndiscountedFcffUSD: NullableNumber;
  dcfAtPeriodUSD: NullableNumber;
  dcfPresentValueTodayUSD: NullableNumber;
  npvAtPeriodUSD: NullableNumber;
  dcfAtPeriodTarget: NullableNumber;
  dcfPresentValueTodayTarget: NullableNumber;
  npvAtPeriodTarget: NullableNumber;
  navAtPeriodTarget: NullableNumber;
  cashTarget: NullableNumber;
  debtTarget: NullableNumber;
  netCashTarget: NullableNumber;
  sharesCurrent: NullableNumber;
  newSharesCumulative: NullableNumber;
  manualExtraShares: number;
  sharesPf: NullableNumber;
  dcfPerShareTarget: NullableNumber;
  dcfPresentValueTodayPerShareTarget: NullableNumber;
  npvPerShareTarget: NullableNumber;
  navPerShareTarget: NullableNumber;
  projectContributions?: ProjectContribution[];
  corporateAdjustmentsUSD?: NullableNumber;
};

export type ValuationTimeline = {
  scope: 'project' | 'corporate';
  timelineStart: number;
  timelineEnd: number;
  todayPeriod: number;
  projectStartPeriod: number;
  productionStartPeriod: number | null;
  periods: ValuationPeriodState[];
};

export type TimelineNodes = {
  today: ValuationPeriodState;
  projectStart: ValuationPeriodState;
  productionStart: ValuationPeriodState | null;
};

export type ValuationChartPoint = {
  periodIndex: number;
  calendarYear: number;
  low: NullableNumber;
  high: NullableNumber;
  isToday: boolean;
  isStart: boolean;
};

export type ValuationChartSelection = {
  points: ValuationChartPoint[];
  today: ValuationChartPoint;
  starts: ValuationChartPoint[];
  peakLow: ValuationChartPoint | null;
  peakHigh: ValuationChartPoint | null;
  selectedStartPeriod: number | null;
};

export type ValuationChartDisplayRange = {
  chartEndYear: number;
  controllingYear: number;
  latestProjectStartYear: number | null;
  points: ValuationChartPoint[];
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const divide = (value: NullableNumber, denominator: NullableNumber): NullableNumber =>
  finite(value) && finite(denominator) && denominator > 0 ? value / denominator : null;
const multiply = (a: NullableNumber, b: NullableNumber): NullableNumber => finite(a) && finite(b) ? a * b : null;

function sumFinite(values: Array<number | null>): NullableNumber {
  if (values.some((value) => !finite(value))) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

export function buildValuationTimeline(args: {
  scope: 'project' | 'corporate';
  fcfUSD: Array<number | null>;
  capexUSD?: Array<number | null>;
  yearsByPeriod: number[];
  discountRate: NullableNumber;
  fxUSDToTarget: NullableNumber;
  valuationPeriodOffset?: number;
  todayPeriod?: number;
  projectStartPeriod?: number;
  productionStartPeriod: number | null;
  cashTarget: NullableNumber;
  debtTarget: NullableNumber;
  sharesCurrent: NullableNumber;
  sharesPf: NullableNumber;
  newSharesCumulative?: NullableNumber;
  manualExtraShares?: number;
  periodEndDates?: string[];
  projectContributionsByPeriod?: ProjectContribution[][];
  corporateAdjustmentsUSD?: Array<number | null>;
}): ValuationTimeline {
  const length = args.fcfUSD.length;
  if (args.yearsByPeriod.length !== length) throw new Error('Canonical timeline requires one calendar year per FCFF period');
  const todayPeriod = args.todayPeriod ?? 0;
  const projectStartPeriod = args.projectStartPeriod ?? 0;
  const offset = Number.isInteger(args.valuationPeriodOffset) ? args.valuationPeriodOffset as number : 0;
  const rate = finite(args.discountRate) && args.discountRate > 0 ? args.discountRate : null;
  const fx = finite(args.fxUSDToTarget) ? args.fxUSDToTarget : null;
  const netCash = finite(args.cashTarget) && finite(args.debtTarget) ? args.cashTarget - args.debtTarget : null;

  const initialCapexBefore = (period: number): NullableNumber => {
    if (!args.capexUSD || period <= projectStartPeriod) return period <= projectStartPeriod ? 0 : null;
    const window = args.capexUSD.slice(projectStartPeriod, period);
    if (window.length !== period - projectStartPeriod || window.some((value) => !finite(value))) return null;
    const values = window as number[];
    return values.some((value) => value < 0)
      ? values.reduce((sum, value) => sum + Math.max(0, -value), 0)
      : values.reduce((sum, value) => sum + Math.max(0, value), 0);
  };

  const periods = args.fcfUSD.map((fcff, periodIndex): ValuationPeriodState => {
    const exponent = periodIndex + offset;
    const discountFactor = rate !== null ? 1 / ((1 + rate) ** exponent) : null;
    const remaining = args.fcfUSD.slice(periodIndex);
    const remainingUndiscounted = sumFinite(remaining);
    const dcfUSD = rate === null || remaining.some((value) => !finite(value)) ? null :
      (remaining as number[]).reduce((sum, value, tailIndex) => sum + value / ((1 + rate) ** tailIndex), 0);
    const initialCapex = initialCapexBefore(periodIndex);
    const npvUSD = periodIndex === todayPeriod
      ? multiply(dcfUSD, discountFactor)
      : dcfUSD !== null && initialCapex !== null ? dcfUSD - initialCapex : null;
    const dcfTarget = multiply(dcfUSD, fx);
    const npvTarget = multiply(npvUSD, fx);
    const navTarget = npvTarget !== null && netCash !== null ? npvTarget + netCash : null;
    const isLast = periodIndex === length - 1;
    const isProductionStart = periodIndex === args.productionStartPeriod;
    const isConstruction = args.productionStartPeriod !== null && periodIndex < args.productionStartPeriod;
    const phase: ValuationPhase = periodIndex === todayPeriod ? 'today' : isProductionStart ? 'production-start' : isLast ? 'closure' : isConstruction ? 'construction' : 'operating';
    const endDate = args.periodEndDates?.[periodIndex] ?? null;
    return {
      periodIndex, calendarYear: args.yearsByPeriod[periodIndex], periodStartDate: null, periodEndDate: endDate,
      phase, isTodayPeriod: periodIndex === todayPeriod, isProjectStartPeriod: periodIndex === projectStartPeriod,
      isConstructionPeriod: isConstruction, isProductionStartPeriod: isProductionStart,
      isOperatingPeriod: !isConstruction && !isLast, isClosurePeriod: isLast,
      discountExponentFromToday: exponent, discountFactorFromToday: discountFactor,
      fcffUSD: finite(fcff) ? fcff : null, discountedFcffFromTodayUSD: multiply(finite(fcff) ? fcff : null, discountFactor),
      remainingUndiscountedFcffUSD: remainingUndiscounted, dcfAtPeriodUSD: dcfUSD,
      dcfPresentValueTodayUSD: multiply(dcfUSD, discountFactor), npvAtPeriodUSD: npvUSD,
      dcfAtPeriodTarget: dcfTarget, dcfPresentValueTodayTarget: multiply(dcfTarget, discountFactor),
      npvAtPeriodTarget: npvTarget, navAtPeriodTarget: navTarget,
      cashTarget: args.cashTarget, debtTarget: args.debtTarget, netCashTarget: netCash,
      sharesCurrent: args.sharesCurrent, newSharesCumulative: args.newSharesCumulative ?? null,
      manualExtraShares: args.manualExtraShares ?? 0, sharesPf: args.sharesPf,
      dcfPerShareTarget: divide(dcfTarget, args.sharesPf),
      dcfPresentValueTodayPerShareTarget: divide(multiply(dcfTarget, discountFactor), args.sharesPf),
      npvPerShareTarget: divide(npvTarget, args.sharesPf), navPerShareTarget: divide(navTarget, args.sharesPf),
      projectContributions: args.projectContributionsByPeriod?.[periodIndex],
      corporateAdjustmentsUSD: args.corporateAdjustmentsUSD?.[periodIndex] ?? null,
    };
  });
  return { scope: args.scope, timelineStart: periods[0]?.calendarYear ?? 0, timelineEnd: periods[periods.length - 1]?.calendarYear ?? 0, todayPeriod, projectStartPeriod, productionStartPeriod: args.productionStartPeriod, periods };
}

export function selectTimelineNodes(timeline: ValuationTimeline): TimelineNodes {
  const today = timeline.periods[timeline.todayPeriod];
  const projectStart = timeline.periods[timeline.projectStartPeriod];
  if (!today || !projectStart) throw new Error('Canonical timeline node is outside the period axis');
  const productionStart = timeline.productionStartPeriod === null ? null : timeline.periods[timeline.productionStartPeriod] ?? null;
  return { today, projectStart, productionStart };
}

export function selectTimelineChartSeries(timeline: ValuationTimeline) {
  return timeline.periods.map((period) => ({
    period: period.periodIndex, year: period.calendarYear,
    high: period.dcfPerShareTarget, low: period.navPerShareTarget,
    dcfPerShare: period.dcfPerShareTarget, navPerShare: period.navPerShareTarget,
  }));
}

/**
 * Canonical chart semantics. Today High is the start DCF brought back to today;
 * subsequent High values are each period's rolling DCF. Low is NAV throughout.
 * Peak selection preserves series identity and never orders Low/High with min/max.
 */
export function selectValuationChart(
  timeline: ValuationTimeline,
  startPeriods: number[] = timeline.productionStartPeriod === null ? [] : [timeline.productionStartPeriod],
): ValuationChartSelection {
  const selectedStartPeriod = selectValuationStartPeriod(timeline, startPeriods);
  const validStartPeriods = new Set(startPeriods.filter((period) => Number.isInteger(period) && timeline.periods[period]));
  if (selectedStartPeriod !== null) validStartPeriods.add(selectedStartPeriod);
  const selectedStart = selectedStartPeriod === null ? null : timeline.periods[selectedStartPeriod] ?? null;
  const points = timeline.periods.map((period): ValuationChartPoint => ({
    periodIndex: period.periodIndex,
    calendarYear: period.calendarYear,
    low: period.navPerShareTarget,
    high: period.periodIndex === timeline.todayPeriod
      ? selectedStart?.dcfPresentValueTodayPerShareTarget ?? null
      : period.dcfPerShareTarget,
    isToday: period.periodIndex === timeline.todayPeriod,
    isStart: validStartPeriods.has(period.periodIndex),
  }));
  const maximum = (field: 'low' | 'high'): ValuationChartPoint | null => points.reduce<ValuationChartPoint | null>((peak, point) => {
    const value = point[field];
    if (!finite(value)) return peak;
    return peak === null || value > (peak[field] as number) ? point : peak;
  }, null);
  const today = points[timeline.todayPeriod];
  if (!today) throw new Error('Canonical chart today period is outside the timeline');
  return {
    points,
    today,
    starts: points.filter((point) => point.isStart),
    peakLow: maximum('low'),
    peakHigh: maximum('high'),
    selectedStartPeriod,
  };
}

/** Corporate and Project tables/charts share this exact milestone rule. */
export function selectValuationStartPeriod(timeline: ValuationTimeline, startPeriods: number[] = []): number | null {
  const valid = startPeriods
    .filter((period) => Number.isInteger(period) && timeline.periods[period])
    .sort((a, b) => {
      const yearDelta = timeline.periods[a].calendarYear - timeline.periods[b].calendarYear;
      return yearDelta !== 0 ? yearDelta : a - b;
    });
  if (valid.length > 0) return valid[0];
  return timeline.productionStartPeriod !== null && timeline.periods[timeline.productionStartPeriod]
    ? timeline.productionStartPeriod
    : null;
}

/** Clips presentation only, after anchors and peaks were selected over the full timeline. */
export function selectValuationChartDisplayRange(
  timeline: ValuationTimeline,
  selection: ValuationChartSelection,
  scope: 'project' | 'corporate',
): ValuationChartDisplayRange {
  const lastYear = timeline.periods.reduce((latest, period) => Math.max(latest, period.calendarYear), timeline.timelineEnd);
  const peakYears = [selection.peakLow?.calendarYear, selection.peakHigh?.calendarYear]
    .filter((year): year is number => finite(year));
  const latestProjectStartYear = selection.starts.reduce<number | null>(
    (latest, point) => latest === null ? point.calendarYear : Math.max(latest, point.calendarYear),
    null,
  );
  const relevantYears = scope === 'corporate' && latestProjectStartYear !== null
    ? [...peakYears, latestProjectStartYear]
    : peakYears;
  const controllingYear = relevantYears.length > 0
    ? Math.max(...relevantYears)
    : selection.today.calendarYear;
  const chartEndYear = Math.min(lastYear, controllingYear + 3);
  return {
    chartEndYear,
    controllingYear,
    latestProjectStartYear,
    points: selection.points.filter((point) => point.calendarYear <= chartEndYear),
  };
}

export function selectTimelineMarker(timeline: ValuationTimeline, period: number): ValuationPeriodState | null {
  return timeline.periods[period] ?? null;
}

export function selectTimelineDebugRows(timeline: ValuationTimeline): ValuationPeriodState[] {
  return timeline.periods;
}
