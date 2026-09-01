export type CorporatePreRevenueValuationOutput = {
  sourcePath: 'snapshot.preRevenueValuation';
  valuationYear: number;
  target: {
    sourcePath: 'canonicalValuationTimeline.projectStartMilestone';
    calendarYear: number;
    periodIndex: number;
    lowNavPerShareTargetCurrency: number;
    highDcfPerShareTargetCurrency: number;
    targetPriceTargetCurrency: number;
  } | null;
  peak6x: {
    sourcePath: 'corporateValuationTimeSeries.canonicalPeriodRows';
    calendarYear: number;
    periodIndex: number;
    valuePerShareTargetCurrency: number;
  } | null;
  diagnostics: string[];
};

type CanonicalTimelinePeriod = {
  periodIndex: number;
  calendarYear: number;
  navPerShareTarget: number | null;
  dcfPerShareTarget: number | null;
};

type CanonicalTimeline = {
  periods: CanonicalTimelinePeriod[];
};

type ProjectStartMilestone = {
  corporatePeriodIndex: number;
  calendarYear: number;
};

type CorporateValuationRow = {
  period: number;
  year: number;
  evEbitda6xPerShare: number | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function buildCorporatePreRevenueValuationOutput(args: {
  valuationYear: number;
  canonicalValuationTimeline: CanonicalTimeline;
  projectStartMilestones: ProjectStartMilestone[];
  corporateValuationTimeSeries: { rows: CorporateValuationRow[] };
}): CorporatePreRevenueValuationOutput {
  const diagnostics: string[] = [];
  const periodsByIndex = new Map(args.canonicalValuationTimeline.periods.map((period) => [period.periodIndex, period]));

  const nextMilestone = [...args.projectStartMilestones]
    .filter((milestone) => Number.isInteger(milestone.corporatePeriodIndex) && finite(milestone.calendarYear) && milestone.calendarYear > args.valuationYear)
    .sort((left, right) => left.calendarYear - right.calendarYear || left.corporatePeriodIndex - right.corporatePeriodIndex)[0] ?? null;

  let target: CorporatePreRevenueValuationOutput['target'] = null;
  if (nextMilestone) {
    const period = periodsByIndex.get(nextMilestone.corporatePeriodIndex) ?? null;
    if (!period || period.calendarYear !== nextMilestone.calendarYear) {
      diagnostics.push('Canonical project-start milestone does not map exactly to the canonical valuation timeline.');
    } else if (!finite(period.navPerShareTarget) || !finite(period.dcfPerShareTarget)) {
      diagnostics.push('Canonical project-start NAV/DCF per-share values are unavailable.');
    } else {
      target = {
        sourcePath: 'canonicalValuationTimeline.projectStartMilestone',
        calendarYear: period.calendarYear,
        periodIndex: period.periodIndex,
        lowNavPerShareTargetCurrency: period.navPerShareTarget,
        highDcfPerShareTargetCurrency: period.dcfPerShareTarget,
        targetPriceTargetCurrency: (period.navPerShareTarget + period.dcfPerShareTarget) / 2,
      };
    }
  } else {
    diagnostics.push('No future canonical project-start milestone is available for Target.');
  }

  let peak6x: CorporatePreRevenueValuationOutput['peak6x'] = null;
  for (const row of args.corporateValuationTimeSeries.rows) {
    const period = periodsByIndex.get(row.period) ?? null;
    if (!period || period.calendarYear !== row.year) {
      diagnostics.push(`Corporate 6x row period/year is not aligned with canonical valuation timeline: period=${String(row.period)} year=${String(row.year)}.`);
      continue;
    }
    if (!finite(row.evEbitda6xPerShare)) continue;
    if (peak6x === null || row.evEbitda6xPerShare > peak6x.valuePerShareTargetCurrency) {
      peak6x = {
        sourcePath: 'corporateValuationTimeSeries.canonicalPeriodRows',
        calendarYear: row.year,
        periodIndex: row.period,
        valuePerShareTargetCurrency: row.evEbitda6xPerShare,
      };
    }
  }
  if (peak6x === null) diagnostics.push('No finite canonical Corporate EV/EBITDA 6x per-share row is available.');

  return {
    sourcePath: 'snapshot.preRevenueValuation',
    valuationYear: args.valuationYear,
    target,
    peak6x,
    diagnostics,
  };
}
