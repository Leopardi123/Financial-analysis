import { loadProjectsForSymbol } from '../api/loadProjectsForSymbol.ts';
import { validateSnapshotRequest } from '../api/validateSnapshotRequest.ts';
import type { CashWaterfallResult } from '../corporate/financing/cashWaterfall.ts';
import { resolveProjectMilestonesV2 } from '../time/resolveProjectMilestones.ts';
import { resolveV2TimeAxis } from '../time/resolveV2TimeAxis.ts';
import { buildCorporateMilestoneBalances } from '../valuation/corporateMilestoneBalance.ts';
import {
  buildValuationTimeline,
  selectCanonicalValuationMetrics,
  selectCorporateProjectStartMilestones,
  type ValuationTimeline,
} from '../valuation/canonicalValuationTimeline.ts';
import {
  runCorporateSnapshotPipeline as runBaseCorporateSnapshotPipeline,
  type CorporateSnapshotRunResult,
} from './runCorporateSnapshot.ts';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

type RawProject = { projectId: string; rawJson: Record<string, unknown> };

type ResolvedProjectMilestone = {
  projectId: string;
  projectName: string | null;
  firstProductionYear: number;
  commercialProductionYear: number;
  valuationMilestoneYear: number;
  fdExtraShares: number;
};

function projectName(rawJson: Record<string, unknown>, fallback: string): string | null {
  const meta = record(rawJson.meta);
  return typeof meta?.projectName === 'string' && meta.projectName.trim().length > 0
    ? meta.projectName
    : fallback;
}

function resolveMilestone(project: RawProject): ResolvedProjectMilestone {
  const time = record(project.rawJson.time);
  if (!time) throw new Error(`[${project.projectId}] time is required for valuation milestones.`);
  const axis = resolveV2TimeAxis({
    masterN: time.masterN as number,
    productionStartPeriod: time.productionStartPeriod as number,
    productionStartYear: time.productionStartYear as number,
  });
  const milestones = resolveProjectMilestonesV2({
    masterN: axis.masterN,
    productionStartPeriod: axis.productionStartPeriod,
    commercialProductionPeriod: time.commercialProductionPeriod as number | null | undefined,
    valuationMilestonePeriod: time.valuationMilestonePeriod as number | null | undefined,
  });
  const equity = record(project.rawJson.equity);
  const fdExtraShares = finite(equity?.fdExtraShares) && (equity?.fdExtraShares as number) > 0
    ? equity?.fdExtraShares as number
    : 0;
  return {
    projectId: project.projectId,
    projectName: projectName(project.rawJson, project.projectId),
    firstProductionYear: axis.yearsByPeriod[milestones.firstProductionPeriod],
    commercialProductionYear: axis.yearsByPeriod[milestones.commercialProductionPeriod],
    valuationMilestoneYear: axis.yearsByPeriod[milestones.valuationMilestonePeriod],
    fdExtraShares,
  };
}

async function loadRawProjects(input: ReturnType<typeof validateSnapshotRequest> extends { ok: true; value: infer T } ? T : never): Promise<RawProject[]> {
  const value = input as unknown as { symbol?: string; projects: RawProject[] };
  return typeof value.symbol === 'string' ? loadProjectsForSymbol(value.symbol) : value.projects;
}

function rewriteCorporateTimeSeries(snapshot: Record<string, unknown>, timeline: ValuationTimeline): void {
  const current = record(snapshot.corporateValuationTimeSeries);
  const currentRows = Array.isArray(current?.rows) ? current?.rows : [];
  const currentByYear = new Map<number, Record<string, unknown>>(
    currentRows.flatMap((raw) => {
      const row = record(raw);
      return row && finite(row.year) ? [[row.year, row] as const] : [];
    }),
  );

  const rows = timeline.periods.map((period) => {
    const old = currentByYear.get(period.calendarYear) ?? {};
    const ev5x = finite(old.ev5xTarget) ? old.ev5xTarget : null;
    const ev6x = finite(old.ev6xTarget) ? old.ev6xTarget : null;
    const ev7x = finite(old.ev7xTarget) ? old.ev7xTarget : null;
    const equityValuePerShare = (ev: number | null): number | null =>
      ev !== null && period.netCashTarget !== null && period.sharesPf !== null && period.sharesPf > 0
        ? (ev + period.netCashTarget) / period.sharesPf
        : null;
    return {
      ...old,
      period: period.periodIndex,
      year: period.calendarYear,
      dcfAbsolute: period.dcfPresentValueTodayTarget,
      navAbsolute: period.navAtPeriodTarget,
      npvAbsolute: period.npvAtPeriodTarget,
      dcfPerShare: period.dcfPresentValueTodayPerShareTarget,
      dcfExCapexAbsolute: period.dcfAtPeriodTarget,
      dcfExCapexPerShare: period.dcfPerShareTarget,
      navPerShare: period.navPerShareTarget,
      npvPerShare: period.npvPerShareTarget,
      sharesPf: period.sharesPf,
      evEbitda5xPerShare: equityValuePerShare(ev5x),
      evEbitda6xPerShare: equityValuePerShare(ev6x),
      evEbitda7xPerShare: equityValuePerShare(ev7x),
    };
  });

  snapshot.corporateValuationTimeSeries = {
    ...(current ?? {}),
    rows,
  };
}

function rewriteQualityMultipleTimeSeries(snapshot: Record<string, unknown>, timeline: ValuationTimeline): void {
  const quality = record(snapshot.corporateQualityMultipleTimeSeries);
  if (!quality || !Array.isArray(quality.rows)) return;
  const timelineByYear = new Map(timeline.periods.map((period) => [period.calendarYear, period]));

  const rewriteBasis = (rawBasis: unknown, year: number): Record<string, unknown> | null => {
    const basis = record(rawBasis);
    if (!basis) return null;
    const period = timelineByYear.get(year) ?? null;
    const bridge = (suffix: 'Low' | 'Mid' | 'High') => {
      const enterprise = basis[`enterpriseValue${suffix}Target`];
      const equity = finite(enterprise) && period?.netCashTarget !== null && period?.netCashTarget !== undefined
        ? enterprise + period.netCashTarget
        : null;
      const perShare = equity !== null && period?.sharesPf !== null && period?.sharesPf !== undefined && period.sharesPf > 0
        ? equity / period.sharesPf
        : null;
      return { equity, perShare };
    };
    const low = bridge('Low');
    const mid = bridge('Mid');
    const high = bridge('High');
    return {
      ...basis,
      equityValueLowTarget: low.equity,
      equityValueMidTarget: mid.equity,
      equityValueHighTarget: high.equity,
      valuePerShareLow: low.perShare,
      valuePerShareMid: mid.perShare,
      valuePerShareHigh: high.perShare,
    };
  };

  quality.rows = quality.rows.map((rawRow) => {
    const row = record(rawRow);
    if (!row || !finite(row.calendarYear)) return rawRow;
    return {
      ...row,
      annualBasis: rewriteBasis(row.annualBasis, row.calendarYear),
      forwardAverageBasis: rewriteBasis(row.forwardAverageBasis, row.calendarYear),
    };
  });
}

function rewriteProjectChartFlows(snapshot: Record<string, unknown>, timeline: ValuationTimeline): void {
  const project = record(snapshot.project);
  if (!project) return;
  const existing = record(project.chartFlows);
  project.chartFlows = {
    ...(existing ?? {}),
    dcfProdstartPresentPerShareSeries: timeline.periods.map((row) => row.dcfPresentValueTodayPerShareTarget),
    navProdstartPerShareSeries: timeline.periods.map((row) => row.navPerShareTarget),
    dcfProdstartExCapexPerShareSeries: timeline.periods.map((row) => row.dcfPerShareTarget),
    navByPeriodPerShareSeries: timeline.periods.map((row) => row.navPerShareTarget),
    yearsByPeriod: timeline.periods.map((row) => row.calendarYear),
    productionStartPeriod: timeline.productionStartPeriod,
    commercialProductionPeriod: timeline.commercialProductionPeriod,
    valuationMilestonePeriod: timeline.valuationMilestonePeriod,
  };
}

function rewriteLegacyModeledTimeline(snapshot: Record<string, unknown>, timeline: ValuationTimeline, projects: ResolvedProjectMilestone[], delay: number): void {
  const markers = projects.flatMap((project) => {
    const year = project.valuationMilestoneYear + delay;
    const state = timeline.periods.find((period) => period.calendarYear === year);
    if (!state) return [];
    return [{
      tp: state.periodIndex,
      yearLabelUsed: String(year),
      corporateTpIndexUsed: state.periodIndex,
      fcfTailSumUSD: state.remainingUndiscountedFcffUSD,
      value_high: state.dcfPerShareTarget,
      value_low: state.navPerShareTarget,
      value_mid_if_any: null,
      nullReasonIfAny: state.dcfPerShareTarget === null || state.navPerShareTarget === null ? 'canonical valuation milestone not computable' : null,
    }];
  }).sort((left, right) => left.tp - right.tp);
  snapshot.modeledValuationTimeline = {
    tps: markers.map((marker) => marker.tp),
    lastTp: markers.length ? markers[markers.length - 1].tp : null,
    rangeEndTp: timeline.periods.length ? timeline.periods.length - 1 : null,
    markers,
  };
}

/**
 * Canonical public snapshot entry point.
 *
 * The underlying project/corporate economics and financing waterfall are left
 * untouched. This finalization layer only resolves distinct project milestones
 * and rebuilds future valuation rows from remaining FCFF plus the periodized
 * balance sheet produced by the existing waterfall.
 */
export async function runCorporateSnapshotPipeline(args: {
  body: unknown;
  refresh?: boolean;
  debug?: boolean;
}): Promise<CorporateSnapshotRunResult> {
  const base = await runBaseCorporateSnapshotPipeline(args);
  if (!base.ok) return base;

  const validation = validateSnapshotRequest(args.body);
  if (!validation.ok) return base;
  const input = validation.value;
  const rawProjects = await loadRawProjects(input as never);
  const milestones = rawProjects.map(resolveMilestone);
  if (milestones.length === 0) return base;

  const snapshot = base.snapshot as unknown as Record<string, unknown>;
  const oldTimeline = snapshot.canonicalValuationTimeline as ValuationTimeline | undefined;
  if (!oldTimeline?.periods?.length) {
    base.diagnostics.warnings.push('Canonical milestone finalization skipped: base canonical valuation timeline missing.');
    return base;
  }

  const delay = (input.scenario.delayPeriods ?? 0)
    + (typeof input.symbol !== 'string' && input.stressOptions?.tpPlus2 ? 2 : 0);
  const years = oldTimeline.periods.map((period) => period.calendarYear);
  const periodForYear = (year: number): number | null => {
    const period = years.indexOf(year + delay);
    return period >= 0 ? period : null;
  };
  const earliest = (values: number[]) => values.length ? Math.min(...values) : null;
  const physicalYear = earliest(milestones.map((project) => project.firstProductionYear));
  const commercialYear = earliest(milestones.map((project) => project.commercialProductionYear));
  const valuationYear = earliest(milestones.map((project) => project.valuationMilestoneYear));
  const physicalPeriod = physicalYear === null ? null : periodForYear(physicalYear);
  const commercialPeriod = commercialYear === null ? null : periodForYear(commercialYear);
  const valuationPeriod = valuationYear === null ? null : periodForYear(valuationYear);

  if (valuationPeriod === null) {
    base.diagnostics.warnings.push('Canonical milestone finalization skipped: valuation milestone falls outside the modeled calendar axis.');
    return base;
  }

  const oldToday = oldTimeline.periods[oldTimeline.todayPeriod] ?? null;
  const fx = finite(snapshot.fx_USD_to_TargetCurrency) ? snapshot.fx_USD_to_TargetCurrency : null;
  const financing = record(snapshot.financing);
  const market = record(snapshot.market);
  const rawWaterfall = record(financing?.corporate_cash_waterfall);
  const cashWaterfall = rawWaterfall as unknown as CashWaterfallResult | null;
  const reportedCashTarget = finite(financing?.latest_quarterly_cash_TargetCurrency)
    ? financing?.latest_quarterly_cash_TargetCurrency as number
    : (finite(input.balanceSheet?.cash_t0_TargetCurrency) ? input.balanceSheet?.cash_t0_TargetCurrency as number : null);
  const currentDebtTarget = finite(input.balanceSheet?.debt_t0_TargetCurrency)
    ? input.balanceSheet?.debt_t0_TargetCurrency as number
    : null;
  const currentShares = finite(market?.shares_current)
    ? market?.shares_current as number
    : (finite(input.market?.shares_current) ? input.market?.shares_current as number : null);

  const balanceBridge = buildCorporateMilestoneBalances({
    years,
    valuationYear: input.valuationYear,
    cashWaterfall,
    fxUSDToTarget: fx,
    reportedCashTarget,
    currentDebtTarget,
    currentShares,
    todaySharesPf: oldToday?.sharesPf ?? null,
    todayNewSharesCumulative: oldToday?.newSharesCumulative ?? null,
  });
  const balances = balanceBridge.balances.map((balance, index) => {
    if (balance.year > input.valuationYear) return balance;
    const old = oldTimeline.periods[index] ?? oldToday;
    return {
      year: balance.year,
      cashTarget: old?.cashTarget ?? balance.cashTarget,
      debtTarget: old?.debtTarget ?? balance.debtTarget,
      sharesPf: old?.sharesPf ?? balance.sharesPf,
      cumulativeNewShares: old?.newSharesCumulative ?? balance.cumulativeNewShares,
    };
  });

  const timeline = buildValuationTimeline({
    scope: oldTimeline.scope,
    fcfUSD: oldTimeline.periods.map((period) => period.fcffUSD),
    yearsByPeriod: years,
    discountRate: finite(snapshot.discountRate) ? snapshot.discountRate : input.discountRate,
    fxUSDToTarget: fx,
    todayPeriod: oldTimeline.todayPeriod,
    projectStartPeriod: oldTimeline.projectStartPeriod,
    productionStartPeriod: physicalPeriod,
    commercialProductionPeriod: commercialPeriod,
    valuationMilestonePeriod: valuationPeriod,
    cashTarget: oldToday?.cashTarget ?? reportedCashTarget,
    debtTarget: oldToday?.debtTarget ?? currentDebtTarget,
    sharesCurrent: currentShares,
    sharesPf: oldToday?.sharesPf ?? currentShares,
    cashTargetByPeriod: balances.map((balance) => balance.cashTarget),
    debtTargetByPeriod: balances.map((balance) => balance.debtTarget),
    sharesPfByPeriod: balances.map((balance) => balance.sharesPf),
    newSharesCumulativeByPeriod: balances.map((balance) => balance.cumulativeNewShares),
    projectContributionsByPeriod: oldTimeline.periods.map((period) => period.projectContributions ?? []),
    corporateAdjustmentsUSD: oldTimeline.periods.map((period) => period.corporateAdjustmentsUSD ?? null),
  });

  snapshot.canonicalValuationTimeline = timeline;
  const canonical = selectCanonicalValuationMetrics(timeline);
  const start = timeline.valuationMilestonePeriod === null ? null : timeline.periods[timeline.valuationMilestonePeriod] ?? null;

  snapshot.DCF_prodStart_exCapex_USD = start?.dcfAtPeriodUSD ?? null;
  snapshot.DCF_prodStart_exCapex_perShare_USD = start?.dcfAtPeriodUSD !== null && start?.sharesPf !== null && start?.sharesPf !== undefined && start.sharesPf > 0
    ? (start.dcfAtPeriodUSD as number) / start.sharesPf
    : null;
  snapshot.DCF_prodStart_present_USD = start?.dcfPresentValueTodayUSD ?? null;
  snapshot.DCF_prodStart_present_perShare_USD = start?.dcfPresentValueTodayUSD !== null && start?.sharesPf !== null && start?.sharesPf !== undefined && start.sharesPf > 0
    ? (start.dcfPresentValueTodayUSD as number) / start.sharesPf
    : null;
  snapshot.DCF_prodStart_exCapex_TargetCurrency = canonical.dcfStart;
  snapshot.DCF_prodStart_exCapex_perShare_TargetCurrency = canonical.dcfPerShareStart;
  snapshot.DCF_prodStart_present_TargetCurrency = canonical.dcfStartPresentToday;
  snapshot.DCF_prodStart_present_perShare_TargetCurrency = canonical.dcfPerShareStartPresentToday;
  snapshot.NPV_prodStart_USD = start?.npvAtPeriodUSD ?? null;
  snapshot.NPV_prodStart_TargetCurrency = canonical.npvStart;
  snapshot.NPV_prodStart_perShare_TargetCurrency = canonical.npvPerShareStart;
  snapshot.NAV_prodStart_TargetCurrency = canonical.navStart;
  snapshot.NAV_prodStart_perShare_TargetCurrency = canonical.navPerShareStart;

  snapshot.projectStartMilestones = selectCorporateProjectStartMilestones(
    timeline,
    milestones.map((project) => ({
      projectId: project.projectId,
      projectName: project.projectName,
      productionStartYear: project.firstProductionYear + delay,
      valuationMilestoneYear: project.valuationMilestoneYear + delay,
    })),
  );

  rewriteCorporateTimeSeries(snapshot, timeline);
  rewriteQualityMultipleTimeSeries(snapshot, timeline);
  const corporateSeries = record(snapshot.corporateValuationTimeSeries);
  if (corporateSeries) {
    corporateSeries.projectMarkers = milestones.map((project) => ({
      projectId: project.projectId,
      projectName: project.projectName,
      productionStartYear: project.firstProductionYear + delay,
      commercialProductionYear: project.commercialProductionYear + delay,
      valuationMilestoneYear: project.valuationMilestoneYear + delay,
    }));
  }
  rewriteProjectChartFlows(snapshot, timeline);
  rewriteLegacyModeledTimeline(snapshot, timeline, milestones, delay);

  // The base snapshot still contains legacy diagnostic identities from the old
  // future-NPV definition (DCF-NPV = incremental CAPEX). Those are invalid once
  // future valuation is defined as the remaining FCFF tail, so replace them with
  // the canonical identities used by this finalizer.
  base.diagnostics.warnings = base.diagnostics.warnings.filter(
    (warning) => !warning.startsWith('Corporate prod-start identity fail year='),
  );
  if (start) {
    const tolerance = 1e-8 * Math.max(1, Math.abs(start.dcfAtPeriodTarget ?? 0), Math.abs(start.navAtPeriodTarget ?? 0));
    if (start.dcfAtPeriodTarget !== null && start.npvAtPeriodTarget !== null
      && Math.abs(start.dcfAtPeriodTarget - start.npvAtPeriodTarget) > tolerance) {
      base.diagnostics.warnings.push(`Canonical milestone identity fail year=${start.calendarYear}: DCF != NPV.`);
    }
    if (start.navAtPeriodTarget !== null && start.npvAtPeriodTarget !== null && start.netCashTarget !== null
      && Math.abs(start.navAtPeriodTarget - (start.npvAtPeriodTarget + start.netCashTarget)) > tolerance) {
      base.diagnostics.warnings.push(`Canonical milestone identity fail year=${start.calendarYear}: NAV != NPV + net cash.`);
    }
  }

  base.diagnostics.warnings.push(...balanceBridge.diagnostics.warnings);
  base.diagnostics.warnings.push(
    `Canonical valuation milestone: firstProduction=${physicalYear === null ? 'null' : physicalYear + delay}, commercialProduction=${commercialYear === null ? 'null' : commercialYear + delay}, valuation=${valuationYear === null ? 'null' : valuationYear + delay}.`,
  );
  base.diagnostics.warnings.push('Future valuation semantics: DCF/NPV use remaining FCFF only; pre-milestone CAPEX is sunk and is not subtracted again.');
  base.diagnostics.warnings.push('Future NAV semantics: periodized waterfall closing cash plus retained non-waterfall cash, cumulative new debt and cumulative canonical shares are used after the valuation year.');
  base.diagnostics.warnings.push('Future debt bridge does not invent amortization: current debt plus modeled waterfall debt additions is used until a debt-service schedule exists.');

  return base;
}
