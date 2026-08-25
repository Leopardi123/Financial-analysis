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
  isCommercialProductionPeriod: boolean;
  isValuationMilestonePeriod: boolean;
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
  commercialProductionPeriod: number | null;
  valuationMilestonePeriod: number | null;
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
  commercialProduction: ValuationPeriodState | null;
  valuationMilestone: ValuationPeriodState | null;
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

function prependPeriodSeries(args: {
  series: Array<number | null> | undefined;
  inputLength: number;
  prefixCount: number;
  prefixValue: NullableNumber;
  label: string;
}): Array<number | null> | null {
  if (!args.series) return null;
  if (args.series.length !== args.inputLength) {
    throw new Error(`${args.label} length must match FCFF length`);
  }
  return [
    ...new Array<number | null>(args.prefixCount).fill(args.prefixValue),
    ...args.series,
  ];
}

export function buildValuationTimeline(args: {
  scope: 'project' | 'corporate';
  fcfUSD: Array<number | null>;
  /** Retained for traceability/shape validation. CAPEX is already embedded in FCFF and is never subtracted again by the valuation timeline. */
  capexUSD?: Array<number | null>;
  yearsByPeriod: number[];
  discountRate: NullableNumber;
  fxUSDToTarget: NullableNumber;
  valuationPeriodOffset?: number;
  todayPeriod?: number;
  /** Verified as-of year. The full model axis may start before this year. */
  valuationYear?: number;
  projectStartPeriod?: number;
  /** First physical production / commissioning output. */
  productionStartPeriod: number | null;
  /** Declared commercial production. Defaults to productionStartPeriod. */
  commercialProductionPeriod?: number | null;
  /** Future Target Price / valuation anchor. Defaults to commercialProductionPeriod, then productionStartPeriod. */
  valuationMilestonePeriod?: number | null;
  cashTarget: NullableNumber;
  debtTarget: NullableNumber;
  sharesCurrent: NullableNumber;
  sharesPf: NullableNumber;
  /** Optional periodized balance-sheet inputs. When supplied they replace the static value for that period. */
  cashTargetByPeriod?: Array<number | null>;
  debtTargetByPeriod?: Array<number | null>;
  sharesPfByPeriod?: Array<number | null>;
  newSharesCumulativeByPeriod?: Array<number | null>;
  newSharesCumulative?: NullableNumber;
  manualExtraShares?: number;
  periodEndDates?: string[];
  projectContributionsByPeriod?: ProjectContribution[][];
  corporateAdjustmentsUSD?: Array<number | null>;
}): ValuationTimeline {
  const inputLength = args.fcfUSD.length;
  if (args.yearsByPeriod.length !== inputLength) throw new Error('Canonical timeline requires one calendar year per FCFF period');
  if (args.capexUSD && args.capexUSD.length !== inputLength) throw new Error('Canonical timeline CAPEX length must match FCFF length');
  const firstModelYear = args.yearsByPeriod[0];
  const prefixYears = args.valuationYear !== undefined && finite(firstModelYear) && args.valuationYear < firstModelYear
    ? Array.from({ length: firstModelYear - args.valuationYear }, (_, index) => (args.valuationYear as number) + index)
    : [];
  const prefixCount = prefixYears.length;
  const yearsByPeriod = [...prefixYears, ...args.yearsByPeriod];
  const fcfUSD = [...new Array<number>(prefixCount).fill(0), ...args.fcfUSD];
  const periodEndDates = args.periodEndDates
    ? [...prefixYears.map((year) => `${year}-12-31`), ...args.periodEndDates]
    : undefined;
  const projectContributionsByPeriod = args.projectContributionsByPeriod
    ? [...new Array<ProjectContribution[]>(prefixCount).fill([]), ...args.projectContributionsByPeriod]
    : undefined;
  const corporateAdjustmentsUSD = args.corporateAdjustmentsUSD
    ? [...new Array<number>(prefixCount).fill(0), ...args.corporateAdjustmentsUSD]
    : undefined;
  const cashTargetByPeriod = prependPeriodSeries({
    series: args.cashTargetByPeriod,
    inputLength,
    prefixCount,
    prefixValue: args.cashTarget,
    label: 'cashTargetByPeriod',
  });
  const debtTargetByPeriod = prependPeriodSeries({
    series: args.debtTargetByPeriod,
    inputLength,
    prefixCount,
    prefixValue: args.debtTarget,
    label: 'debtTargetByPeriod',
  });
  const sharesPfByPeriod = prependPeriodSeries({
    series: args.sharesPfByPeriod,
    inputLength,
    prefixCount,
    prefixValue: args.sharesPf,
    label: 'sharesPfByPeriod',
  });
  const newSharesCumulativeByPeriod = prependPeriodSeries({
    series: args.newSharesCumulativeByPeriod,
    inputLength,
    prefixCount,
    prefixValue: args.newSharesCumulative ?? null,
    label: 'newSharesCumulativeByPeriod',
  });
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
  const commercialBase = args.commercialProductionPeriod ?? args.productionStartPeriod;
  const commercialProductionPeriod = commercialBase === null ? null : commercialBase + prefixCount;
  const valuationBase = args.valuationMilestonePeriod ?? commercialBase;
  const valuationMilestonePeriod = valuationBase === null ? null : valuationBase + prefixCount;
  for (const [label, period] of [
    ['productionStartPeriod', productionStartPeriod],
    ['commercialProductionPeriod', commercialProductionPeriod],
    ['valuationMilestonePeriod', valuationMilestonePeriod],
  ] as const) {
    if (period !== null && (!Number.isInteger(period) || period < 0 || period >= length)) {
      throw new Error(`Canonical ${label} is outside the model calendar axis`);
    }
  }
  const offset = args.todayPeriod === undefined && args.valuationYear === undefined && Number.isInteger(args.valuationPeriodOffset)
    ? args.valuationPeriodOffset as number
    : 0;
  const rate = finite(args.discountRate) && args.discountRate > 0 ? args.discountRate : null;
  const fx = finite(args.fxUSDToTarget) ? args.fxUSDToTarget : null;

  const periods = fcfUSD.map((fcff, periodIndex): ValuationPeriodState => {
    const exponent = periodIndex - todayPeriod + offset;
    const discountFactor = rate !== null ? 1 / ((1 + rate) ** exponent) : null;
    const remaining = fcfUSD.slice(periodIndex);
    const remainingUndiscounted = sumFinite(remaining);
    const dcfUSD = rate === null || remaining.some((value) => !finite(value)) ? null :
      (remaining as number[]).reduce((sum, value, tailIndex) => sum + value / ((1 + rate) ** tailIndex), 0);

    // FCFF is the canonical enterprise cash-flow series and already contains all
    // construction/sustaining/closure CAPEX in the period where it occurs. A
    // future valuation therefore starts with the remaining FCFF tail. Historical
    // CAPEX is sunk at that future date and must never be deducted a second time.
    const npvUSD = dcfUSD;
    const dcfTarget = multiply(dcfUSD, fx);
    const npvTarget = multiply(npvUSD, fx);
    const cashAtPeriod = cashTargetByPeriod ? cashTargetByPeriod[periodIndex] ?? null : args.cashTarget;
    const debtAtPeriod = debtTargetByPeriod ? debtTargetByPeriod[periodIndex] ?? null : args.debtTarget;
    const netCashAtPeriod = finite(cashAtPeriod) && finite(debtAtPeriod) ? cashAtPeriod - debtAtPeriod : null;
    const sharesAtPeriod = sharesPfByPeriod ? sharesPfByPeriod[periodIndex] ?? null : args.sharesPf;
    const newSharesAtPeriod = newSharesCumulativeByPeriod
      ? newSharesCumulativeByPeriod[periodIndex] ?? null
      : args.newSharesCumulative ?? null;
    const navTarget = npvTarget !== null && netCashAtPeriod !== null ? npvTarget + netCashAtPeriod : null;
    const isLast = periodIndex === length - 1;
    const isProductionStart = periodIndex === productionStartPeriod;
    const isCommercialProduction = periodIndex === commercialProductionPeriod;
    const isValuationMilestone = periodIndex === valuationMilestonePeriod;
    const isConstruction = productionStartPeriod !== null && periodIndex < productionStartPeriod;
    const isHistorical = periodIndex < todayPeriod;
    const phase: ValuationPhase = isHistorical ? 'historical' : periodIndex === todayPeriod ? 'today' : isProductionStart ? 'production-start' : isLast ? 'closure' : isConstruction ? 'construction' : 'operating';
    const endDate = periodEndDates?.[periodIndex] ?? null;
    return {
      periodIndex, calendarYear: yearsByPeriod[periodIndex], periodStartDate: null, periodEndDate: endDate,
      phase, isTodayPeriod: periodIndex === todayPeriod, isHistoricalPeriod: isHistorical, isProjectStartPeriod: periodIndex === projectStartPeriod,
      isConstructionPeriod: isConstruction, isProductionStartPeriod: isProductionStart,
      isCommercialProductionPeriod: isCommercialProduction, isValuationMilestonePeriod: isValuationMilestone,
      isOperatingPeriod: !isConstruction && !isLast, isClosurePeriod: isLast,
      discountExponentFromToday: exponent, discountFactorFromToday: discountFactor,
      fcffUSD: finite(fcff) ? fcff : null, discountedFcffFromTodayUSD: multiply(finite(fcff) ? fcff : null, discountFactor),
      remainingUndiscountedFcffUSD: remainingUndiscounted, dcfAtPeriodUSD: dcfUSD,
      dcfPresentValueTodayUSD: multiply(dcfUSD, discountFactor), npvAtPeriodUSD: npvUSD,
      dcfAtPeriodTarget: dcfTarget, dcfPresentValueTodayTarget: multiply(dcfTarget, discountFactor),
      npvAtPeriodTarget: npvTarget, navAtPeriodTarget: navTarget,
      cashTarget: cashAtPeriod, debtTarget: debtAtPeriod, netCashTarget: netCashAtPeriod,
      sharesCurrent: args.sharesCurrent, newSharesCumulative: newSharesAtPeriod,
      manualExtraShares: args.manualExtraShares ?? 0,
      sharesPfBeforeManualExtra: finite(sharesAtPeriod) ? sharesAtPeriod - (args.manualExtraShares ?? 0) : null,
      sharesPf: sharesAtPeriod, canonicalSharesForPerShare: sharesAtPeriod,
      dcfPerShareTarget: divide(dcfTarget, sharesAtPeriod),
      dcfPresentValueTodayPerShareTarget: divide(multiply(dcfTarget, discountFactor), sharesAtPeriod),
      npvPerShareTarget: divide(npvTarget, sharesAtPeriod), navPerShareTarget: divide(navTarget, sharesAtPeriod),
      projectContributions: projectContributionsByPeriod?.[periodIndex],
      corporateAdjustmentsUSD: corporateAdjustmentsUSD?.[periodIndex] ?? null,
    };
  });
  return {
    scope: args.scope,
    timelineStart: periods[0]?.calendarYear ?? 0,
    timelineEnd: periods[periods.length - 1]?.calendarYear ?? 0,
    todayPeriod,
    projectStartPeriod,
    productionStartPeriod,
    commercialProductionPeriod,
    valuationMilestonePeriod,
    periods,
  };
}

export function selectTimelineNodes(timeline: ValuationTimeline): TimelineNodes {
  const today = timeline.periods[timeline.todayPeriod];
  const projectStart = timeline.periods[timeline.projectStartPeriod];
  if (!today || !projectStart) throw new Error('Canonical timeline node is outside the period axis');
  const productionStart = timeline.productionStartPeriod === null ? null : timeline.periods[timeline.productionStartPeriod] ?? null;
  const commercialProduction = timeline.commercialProductionPeriod === null ? null : timeline.periods[timeline.commercialProductionPeriod] ?? null;
  const valuationMilestone = timeline.valuationMilestonePeriod === null ? null : timeline.periods[timeline.valuationMilestonePeriod] ?? null;
  return { today, projectStart, productionStart, commercialProduction, valuationMilestone };
}

/** Sole table/chart scalar adapter for canonical valuation values. */
export function selectCanonicalValuationMetrics(timeline: ValuationTimeline): CanonicalValuationMetrics {
  const { today, valuationMilestone } = selectTimelineNodes(timeline);
  return {
    npvToday: today.npvAtPeriodTarget,
    npvPerShareToday: today.npvPerShareTarget,
    navToday: today.navAtPeriodTarget,
    navPerShareToday: today.navPerShareTarget,
    dcfStart: valuationMilestone?.dcfAtPeriodTarget ?? null,
    dcfPerShareStart: valuationMilestone?.dcfPerShareTarget ?? null,
    dcfStartPresentToday: valuationMilestone?.dcfPresentValueTodayTarget ?? null,
    dcfPerShareStartPresentToday: valuationMilestone?.dcfPresentValueTodayPerShareTarget ?? null,
    npvStart: valuationMilestone?.npvAtPeriodTarget ?? null,
    npvPerShareStart: valuationMilestone?.npvPerShareTarget ?? null,
    navStart: valuationMilestone?.navAtPeriodTarget ?? null,
    navPerShareStart: valuationMilestone?.navPerShareTarget ?? null,
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

/** Resolve project-local valuation milestone years once; tables, charts and debug consume these objects. */
export function selectCorporateProjectStartMilestones(
  timeline: ValuationTimeline,
  projects: Array<{
    projectId: string;
    projectName?: string | null;
    productionStartYear: number | null;
    valuationMilestoneYear?: number | null;
  }>,
): CorporateProjectStartMilestone[] {
  if (timeline.scope !== 'corporate') throw new Error('Corporate project milestones require a corporate timeline');
  return projects.flatMap((project) => {
    const milestoneYear = finite(project.valuationMilestoneYear) ? project.valuationMilestoneYear : project.productionStartYear;
    if (!finite(milestoneYear)) return [];
    const state = timeline.periods.find((period) => period.calendarYear === milestoneYear);
    if (!state) return [];
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
 * Canonical chart semantics. Today High is the selected valuation-milestone DCF
 * brought back to today; subsequent High values are each period's rolling DCF.
 * Low is NAV throughout. Peak selection preserves series identity and never
 * orders Low/High with min/max.
 */
export function selectValuationChart(
  timeline: ValuationTimeline,
  startPeriods: number[] = timeline.valuationMilestonePeriod === null ? [] : [timeline.valuationMilestonePeriod],
): ValuationChartSelection {
  const selectedStartPeriod = selectValuationStartPeriod(timeline, startPeriods);
  const validStartPeriods = new Set(startPeriods.filter((period) => Number.isInteger(period) && timeline.periods[period]));
  if (selectedStartPeriod !== null) validStartPeriods.add(selectedStartPeriod);
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

/** Corporate and Project tables/charts share this exact valuation-milestone rule. */
export function selectValuationStartPeriod(timeline: ValuationTimeline, startPeriods: number[] = []): number | null {
  const valid = startPeriods
    .filter((period) => Number.isInteger(period) && timeline.periods[period])
    .sort((a, b) => {
      const yearDelta = timeline.periods[a].calendarYear - timeline.periods[b].calendarYear;
      return yearDelta !== 0 ? yearDelta : a - b;
    });
  if (valid.length > 0) return valid[0];
  return timeline.valuationMilestonePeriod !== null && timeline.periods[timeline.valuationMilestonePeriod]
    ? timeline.valuationMilestonePeriod
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
