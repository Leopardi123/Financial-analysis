export type NullableNumber = number | null;

export type ValuationPhase = 'historical' | 'today' | 'construction' | 'production-start' | 'operating' | 'closure';

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
  isHistoricalPeriod: boolean;
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
  sharesPfBeforeManualExtra: NullableNumber;
  sharesPf: NullableNumber;
  canonicalSharesForPerShare: NullableNumber;
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

export type CorporateProjectStartMilestone = {
  projectId: string;
  projectName: string | null;
  corporatePeriodIndex: number;
  calendarYear: number;
  navPerShare: NullableNumber;
  dcfPerShare: NullableNumber;
  dcfPresentValueTodayPerShare: NullableNumber;
};

export type TimelineNodes = {
  today: ValuationPeriodState;
  projectStart: ValuationPeriodState;
  productionStart: ValuationPeriodState | null;
};

export type CanonicalValuationMetrics = {
  npvToday: NullableNumber;
  npvPerShareToday: NullableNumber;
  navToday: NullableNumber;
  navPerShareToday: NullableNumber;
  dcfStart: NullableNumber;
  dcfPerShareStart: NullableNumber;
  dcfStartPresentToday: NullableNumber;
  dcfPerShareStartPresentToday: NullableNumber;
  npvStart: NullableNumber;
  npvPerShareStart: NullableNumber;
  navStart: NullableNumber;
  navPerShareStart: NullableNumber;
};

export type ValuationChartPoint = {
  periodIndex: number;
  calendarYear: number;
  low: NullableNumber;
  high: NullableNumber;
  isToday: boolean;
  isStart: boolean;
  highSource: 'start-dcf-present' | 'start-dcf-rollup' | 'period-remaining-dcf';
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
  /** Verified as-of year. The full model axis may start before this year. */
  valuationYear?: number;
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
  const inputLength = args.fcfUSD.length;
  if (args.yearsByPeriod.length !== inputLength) throw new Error('Canonical timeline requires one calendar year per FCFF period');
  const firstModelYear = args.yearsByPeriod[0];
  const prefixYears = args.valuationYear !== undefined && finite(firstModelYear) && args.valuationYear < firstModelYear
    ? Array.from({ length: firstModelYear - args.valuationYear }, (_, index) => (args.valuationYear as number) + index)
    : [];
  const prefixCount = prefixYears.length;
  const yearsByPeriod = [...prefixYears, ...args.yearsByPeriod];
  const fcfUSD = [...new Array<number>(prefixCount).fill(0), ...args.fcfUSD];
  const capexUSD = args.capexUSD ? [...new Array<number>(prefixCount).fill(0), ...args.capexUSD] : undefined;
  const periodEndDates = args.periodEndDates
    ? [...prefixYears.map((year) => `${year}-12-31`), ...args.periodEndDates]
    : undefined;
  const projectContributionsByPeriod = args.projectContributionsByPeriod
    ? [...new Array<ProjectContribution[]>(prefixCount).fill([]), ...args.projectContributionsByPeriod]
    : undefined;
  const corporateAdjustmentsUSD = args.corporateAdjustmentsUSD
    ? [...new Array<number>(prefixCount).fill(0), ...args.corporateAdjustmentsUSD]
    : undefined;
  const length = fcfUSD.length;
  const resolvedTodayPeriod = args.todayPeriod ?? (args.valuationYear === undefined
    ? 0
    : yearsByPeriod.indexOf(args.valuationYear));
  if (!Number.isInteger(resolvedTodayPeriod) || resolvedTodayPeriod < 0 || resolvedTodayPeriod >= length) {
    throw new Error(`Canonical valuation year ${String(args.valuationYear)} is outside the model calendar axis`);
  }
  const todayPeriod = resolvedTodayPeriod;
  const projectStartPeriod = (args.projectStartPeriod ?? 0) + prefixCount;
  const productionStartPeriod = args.productionStartPeriod === null ? null : args.productionStartPeriod + prefixCount;
  const offset = args.todayPeriod === undefined && args.valuationYear === undefined && Number.isInteger(args.valuationPeriodOffset)
    ? args.valuationPeriodOffset as number
    : 0;
  const rate = finite(args.discountRate) && args.discountRate > 0 ? args.discountRate : null;
  const fx = finite(args.fxUSDToTarget) ? args.fxUSDToTarget : null;
  const netCash = finite(args.cashTarget) && finite(args.debtTarget) ? args.cashTarget - args.debtTarget : null;

  const initialCapexBefore = (period: number): NullableNumber => {
    if (!capexUSD || period <= projectStartPeriod) return period <= projectStartPeriod ? 0 : null;
    const window = capexUSD.slice(projectStartPeriod, period);
    if (window.length !== period - projectStartPeriod || window.some((value) => !finite(value))) return null;
    const values = window as number[];
    return values.some((value) => value < 0)
      ? values.reduce((sum, value) => sum + Math.max(0, -value), 0)
      : values.reduce((sum, value) => sum + Math.max(0, value), 0);
  };

  const periods = fcfUSD.map((fcff, periodIndex): ValuationPeriodState => {
    const exponent = periodIndex - todayPeriod + offset;
    const discountFactor = rate !== null ? 1 / ((1 + rate) ** exponent) : null;
    const remaining = fcfUSD.slice(periodIndex);
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
    const isProductionStart = periodIndex === productionStartPeriod;
    const isConstruction = productionStartPeriod !== null && periodIndex < productionStartPeriod;
    const isHistorical = periodIndex < todayPeriod;
    const phase: ValuationPhase = isHistorical ? 'historical' : periodIndex === todayPeriod ? 'today' : isProductionStart ? 'production-start' : isLast ? 'closure' : isConstruction ? 'construction' : 'operating';
    const endDate = periodEndDates?.[periodIndex] ?? null;
    return {
      periodIndex, calendarYear: yearsByPeriod[periodIndex], periodStartDate: null, periodEndDate: endDate,
      phase, isTodayPeriod: periodIndex === todayPeriod, isHistoricalPeriod: isHistorical, isProjectStartPeriod: periodIndex === projectStartPeriod,
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
      manualExtraShares: args.manualExtraShares ?? 0,
      sharesPfBeforeManualExtra: finite(args.sharesPf) ? args.sharesPf - (args.manualExtraShares ?? 0) : null,
      sharesPf: args.sharesPf, canonicalSharesForPerShare: args.sharesPf,
      dcfPerShareTarget: divide(dcfTarget, args.sharesPf),
      dcfPresentValueTodayPerShareTarget: divide(multiply(dcfTarget, discountFactor), args.sharesPf),
      npvPerShareTarget: divide(npvTarget, args.sharesPf), navPerShareTarget: divide(navTarget, args.sharesPf),
      projectContributions: projectContributionsByPeriod?.[periodIndex],
      corporateAdjustmentsUSD: corporateAdjustmentsUSD?.[periodIndex] ?? null,
    };
  });
  return { scope: args.scope, timelineStart: periods[0]?.calendarYear ?? 0, timelineEnd: periods[periods.length - 1]?.calendarYear ?? 0, todayPeriod, projectStartPeriod, productionStartPeriod, periods };
}

export function selectTimelineNodes(timeline: ValuationTimeline): TimelineNodes {
  const today = timeline.periods[timeline.todayPeriod];
  const projectStart = timeline.periods[timeline.projectStartPeriod];
  if (!today || !projectStart) throw new Error('Canonical timeline node is outside the period axis');
  const productionStart = timeline.productionStartPeriod === null ? null : timeline.periods[timeline.productionStartPeriod] ?? null;
  return { today, projectStart, productionStart };
}

/** Sole table/chart scalar adapter for canonical valuation values. */
export function selectCanonicalValuationMetrics(timeline: ValuationTimeline): CanonicalValuationMetrics {
  const { today, productionStart } = selectTimelineNodes(timeline);
  return {
    npvToday: today.npvAtPeriodTarget,
    npvPerShareToday: today.npvPerShareTarget,
    navToday: today.navAtPeriodTarget,
    navPerShareToday: today.navPerShareTarget,
    dcfStart: productionStart?.dcfAtPeriodTarget ?? null,
    dcfPerShareStart: productionStart?.dcfPerShareTarget ?? null,
    dcfStartPresentToday: productionStart?.dcfPresentValueTodayTarget ?? null,
    dcfPerShareStartPresentToday: productionStart?.dcfPresentValueTodayPerShareTarget ?? null,
    npvStart: productionStart?.npvAtPeriodTarget ?? null,
    npvPerShareStart: productionStart?.npvPerShareTarget ?? null,
    navStart: productionStart?.navAtPeriodTarget ?? null,
    navPerShareStart: productionStart?.navPerShareTarget ?? null,
  };
}

/** Apply a UI-only manual share adjustment without creating financing proceeds. */
export function withManualExtraShares(
  timeline: ValuationTimeline,
  manualExtraShares: number,
): ValuationTimeline {
  const extra = Number.isFinite(manualExtraShares) ? Math.max(0, Math.floor(manualExtraShares)) : 0;
  if (extra === 0) return timeline;
  return {
    ...timeline,
    periods: timeline.periods.map((period) => {
      const baseShares = finite(period.sharesPf) ? period.sharesPf - period.manualExtraShares : null;
      const sharesPf = finite(baseShares) ? baseShares + extra : null;
      return {
        ...period,
        manualExtraShares: extra,
        sharesPfBeforeManualExtra: baseShares,
        sharesPf,
        canonicalSharesForPerShare: sharesPf,
        dcfPerShareTarget: divide(period.dcfAtPeriodTarget, sharesPf),
        dcfPresentValueTodayPerShareTarget: divide(period.dcfPresentValueTodayTarget, sharesPf),
        npvPerShareTarget: divide(period.npvAtPeriodTarget, sharesPf),
        navPerShareTarget: divide(period.navAtPeriodTarget, sharesPf),
      };
    }),
  };
}

/** Resolve project-local start years once; tables, charts and debug consume these objects. */
export function selectCorporateProjectStartMilestones(
  timeline: ValuationTimeline,
  projects: Array<{ projectId: string; projectName?: string | null; productionStartYear: number | null }>,
): CorporateProjectStartMilestone[] {
  if (timeline.scope !== 'corporate') throw new Error('Corporate project milestones require a corporate timeline');
  return projects.flatMap((project) => {
    if (!finite(project.productionStartYear)) return [];
    const state = timeline.periods.find((period) => period.calendarYear === project.productionStartYear);
    // Project starts before the valuation year remain in the internal trace, but they are historical rather than current valuation milestones.
    if (!state || state.periodIndex < timeline.todayPeriod) return [];
    return [{
      projectId: project.projectId,
      projectName: project.projectName ?? null,
      corporatePeriodIndex: state.periodIndex,
      calendarYear: state.calendarYear,
      navPerShare: state.navPerShareTarget,
      dcfPerShare: state.dcfPerShareTarget,
      dcfPresentValueTodayPerShare: state.dcfPresentValueTodayPerShareTarget,
    }];
  }).sort((left, right) => left.calendarYear - right.calendarYear || left.projectId.localeCompare(right.projectId));
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
  const validStartPeriods = new Set(startPeriods.filter((period) =>
    Number.isInteger(period) && period >= timeline.todayPeriod && timeline.periods[period]
  ));
  if (selectedStartPeriod !== null && timeline.productionStartPeriod === selectedStartPeriod) {
    validStartPeriods.add(selectedStartPeriod);
  }
  const selectedStart = selectedStartPeriod === null ? null : timeline.periods[selectedStartPeriod] ?? null;
  const points = timeline.periods.map((period): ValuationChartPoint => {
    const isToday = period.periodIndex === timeline.todayPeriod;
    const isBeforeSelectedStart = selectedStartPeriod !== null && period.periodIndex < selectedStartPeriod;
    const high = isToday
      ? selectedStart?.dcfPresentValueTodayPerShareTarget ?? null
      : isBeforeSelectedStart
        ? rollStartDcfToPeriod(selectedStart, period)
        : period.dcfPerShareTarget;
    return {
      periodIndex: period.periodIndex,
      calendarYear: period.calendarYear,
      low: period.navPerShareTarget,
      high,
      isToday,
      isStart: validStartPeriods.has(period.periodIndex),
      highSource: isToday ? 'start-dcf-present' : isBeforeSelectedStart ? 'start-dcf-rollup' : 'period-remaining-dcf',
    };
  });
  const maximum = (field: 'low' | 'high'): ValuationChartPoint | null => points.reduce<ValuationChartPoint | null>((peak, point) => {
    if (point.periodIndex < timeline.todayPeriod) return peak;
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

function rollStartDcfToPeriod(
  start: ValuationPeriodState | null,
  period: ValuationPeriodState,
): NullableNumber {
  if (
    start?.dcfPerShareTarget === null || start?.dcfPerShareTarget === undefined
    || !finite(start.discountFactorFromToday) || !finite(period.discountFactorFromToday)
    || period.discountFactorFromToday === 0
  ) return null;
  return start.dcfPerShareTarget * (start.discountFactorFromToday / period.discountFactorFromToday);
}

/** Corporate and Project tables/charts share this exact milestone rule. */
export function selectValuationStartPeriod(timeline: ValuationTimeline, startPeriods: number[] = []): number | null {
  const valid = startPeriods
    .filter((period) => Number.isInteger(period) && period >= timeline.todayPeriod && timeline.periods[period])
    .sort((a, b) => {
      const yearDelta = timeline.periods[a].calendarYear - timeline.periods[b].calendarYear;
      return yearDelta !== 0 ? yearDelta : a - b;
    });
  if (valid.length > 0) return valid[0];
  return timeline.productionStartPeriod !== null
    && timeline.productionStartPeriod >= timeline.todayPeriod
    && timeline.periods[timeline.productionStartPeriod]
    ? timeline.productionStartPeriod
    : timeline.periods[timeline.todayPeriod]
      ? timeline.todayPeriod
      : null;
}

/** Clips presentation only, after anchors and peaks were selected over the current/future valuation window. */
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
    points: selection.points.filter((point) =>
      point.periodIndex >= timeline.todayPeriod && point.calendarYear <= chartEndYear
    ),
  };
}

export function selectTimelineMarker(timeline: ValuationTimeline, period: number): ValuationPeriodState | null {
  return timeline.periods[period] ?? null;
}

export function selectTimelineDebugRows(timeline: ValuationTimeline): ValuationPeriodState[] {
  return timeline.periods;
}
