import { isProjectIncludedInCase } from './production.ts';
import type { CostComponent, CostDisclosure, ProducerCaseMode, ProducerJsonV1, ProducerProject } from './types.ts';

export type ProducerCalculabilityMetric = 'Au/AuEq' | 'Revenue' | 'EBITDA' | 'FCFF före growth' | 'FCFF efter growth' | 'EV';
export type ProducerCalculabilityState = 'calculable' | 'range_only' | 'reported_only' | 'blocked';

export type ProducerCalculabilityResult = {
  metric: ProducerCalculabilityMetric;
  state: ProducerCalculabilityState;
  missing: string[];
  notes: string[];
};

export type ProducerYearCalculability = {
  year: number;
  caseMode: ProducerCaseMode;
  metrics: ProducerCalculabilityResult[];
};

const EBITDA_COMPONENTS: CostComponent[] = [
  'cash_operating_cost',
  'royalty',
  'production_tax',
  'tc_rc',
  'site_gna',
  'other_recurring_operating',
];

const PRE_GROWTH_COMPONENTS: CostComponent[] = [
  'sustaining_capex',
  'sustaining_exploration',
  'cash_income_tax',
  'working_capital_delta',
  'other_cash',
];

const GROWTH_COMPONENTS: CostComponent[] = ['growth_capex', 'growth_exploration'];

function periodCoversYear(period: CostDisclosure['period'] | ProducerProject['production'][number]['period'], year: number): boolean {
  if (period.kind === 'year') return period.year === year;
  if (period.kind === 'year_range_average' || period.kind === 'year_range_total') {
    return year >= period.startYear && year <= period.endYear;
  }
  return false;
}

function projectIsEconomicallyActive(project: ProducerProject, year: number, caseMode: ProducerCaseMode): boolean {
  if (!isProjectIncludedInCase(project.statusAsOfValuationDate, caseMode)) return false;
  const window = project.productionWindow;
  if (!window) return true;
  if (year < window.startYear) return false;
  if (window.endYear !== undefined && year > window.endYear) return false;
  return true;
}

function projectProductionStatus(project: ProducerProject, year: number): { state: 'scalar' | 'range' | 'missing'; missing: string[]; notes: string[] } {
  const produced = project.production.filter((item) => item.measure === 'produced' && periodCoversYear(item.period, year));
  if (produced.length === 0) {
    return {
      state: 'missing',
      missing: [`projects[${project.id}].production: produced disclosure covering ${year}`],
      notes: [],
    };
  }

  const missing: string[] = [];
  const notes: string[] = [];
  let hasRange = false;
  for (const disclosure of produced) {
    if (disclosure.period.kind !== 'year') {
      hasRange = true;
      notes.push(`${project.id}/${disclosure.metal}: multi-year production evidence covers ${year} but is not an exact annual point.`);
    }
    if (disclosure.quantity.kind === 'range' || disclosure.quantity.kind === 'upper_bound' || disclosure.quantity.kind === 'lower_bound') {
      hasRange = true;
    }
    if (disclosure.basis === 'project_100pct' && project.ownership.length === 0) {
      missing.push(`projects[${project.id}].ownership: required to convert project_100pct production to attributable production`);
    }
  }
  if (missing.length > 0) return { state: 'missing', missing, notes };
  return { state: hasRange ? 'range' : 'scalar', missing: [], notes };
}

function costComponentCoveredAtCompanyLevel(producer: ProducerJsonV1, component: CostComponent, year: number): boolean {
  return (producer.corporateCosts ?? []).some((cost) => cost.component === component && periodCoversYear(cost.period, year));
}

function projectCostMissing(producer: ProducerJsonV1, projects: ProducerProject[], component: CostComponent, year: number): string[] {
  if (costComponentCoveredAtCompanyLevel(producer, component, year)) return [];
  const missing: string[] = [];
  for (const project of projects) {
    const has = (project.costs ?? []).some((cost) => cost.component === component && periodCoversYear(cost.period, year));
    if (!has) missing.push(`projects[${project.id}].costs: ${component} for ${year}, or one company-level corporateCosts replacement`);
  }
  return missing;
}

function companyReportedMetricExists(producer: ProducerJsonV1, metric: string, year: number): boolean {
  return (producer.reportedMetrics ?? []).some((item) => item.metric === metric && item.scope.type === 'company' && item.period.kind === 'year' && item.period.year === year);
}

export function assessProducerYearCalculability(
  producer: ProducerJsonV1,
  year: number,
  caseMode: ProducerCaseMode = 'BASE',
): ProducerYearCalculability {
  const activeProjects = producer.projects.filter((project) => projectIsEconomicallyActive(project, year, caseMode));
  const productionStates = activeProjects.map((project) => ({ project, status: projectProductionStatus(project, year) }));
  const productionMissing = productionStates.flatMap((item) => item.status.missing);
  const productionNotes = productionStates.flatMap((item) => item.status.notes);
  const hasRange = productionStates.some((item) => item.status.state === 'range');
  const reportedProduction = companyReportedMetricExists(producer, 'production', year);

  const auState: ProducerCalculabilityState = productionMissing.length === 0
    ? (hasRange ? 'range_only' : 'calculable')
    : (reportedProduction ? 'reported_only' : 'blocked');

  const au: ProducerCalculabilityResult = {
    metric: 'Au/AuEq',
    state: auState,
    missing: productionMissing,
    notes: [
      ...productionNotes,
      ...(reportedProduction && productionMissing.length > 0
        ? ['Company-level reported production exists and can be displayed, but it does not repair missing canonical attributable project production.']
        : []),
    ],
  };

  const revenue: ProducerCalculabilityResult = {
    metric: 'Revenue',
    state: auState,
    missing: [...productionMissing],
    notes: [
      'SPOT/LT metal prices are runtime inputs and do not need to be stored in producer_json_v1.',
      'Revenue uses payable > sold > produced by metal. produced is allowed only as an explicitly marked approximation.',
    ],
  };

  const ebitdaMissing = [...productionMissing];
  for (const component of EBITDA_COMPONENTS) ebitdaMissing.push(...projectCostMissing(producer, activeProjects, component, year));
  if (!costComponentCoveredAtCompanyLevel(producer, 'corporate_gna', year)) {
    ebitdaMissing.push(`corporateCosts: corporate_gna for ${year} (explicit zero is acceptable only when source-backed)`);
  }
  const ebitdaReported = companyReportedMetricExists(producer, 'ebitda', year);
  const ebitda: ProducerCalculabilityResult = {
    metric: 'EBITDA',
    state: ebitdaMissing.length === 0 ? (hasRange ? 'range_only' : 'calculable') : (ebitdaReported ? 'reported_only' : 'blocked'),
    missing: [...new Set(ebitdaMissing)],
    notes: [
      'Canonical EBITDA = selected-deck revenue - cash operating cost - royalties - production taxes - TC/RC - site G&A - corporate G&A - other recurring operating cash expenses.',
      'AISC is NOT an EBITDA substitute because it contains sustaining items and may use a different denominator/price basis.',
      'If a disclosed composite cost already includes royalty/TC-RC/G&A, encode that relationship explicitly in CostDisclosure.definition.includesComponents instead of adding the cost twice.',
    ],
  };

  const preGrowthMissing = [...ebitdaMissing];
  for (const component of PRE_GROWTH_COMPONENTS) preGrowthMissing.push(...projectCostMissing(producer, activeProjects, component, year));
  const reportedFcf = companyReportedMetricExists(producer, 'fcf', year);
  const preGrowth: ProducerCalculabilityResult = {
    metric: 'FCFF före growth',
    state: preGrowthMissing.length === 0 ? (hasRange ? 'range_only' : 'calculable') : (reportedFcf ? 'reported_only' : 'blocked'),
    missing: [...new Set(preGrowthMissing)],
    notes: [
      'Requires canonical EBITDA plus sustaining CAPEX, sustaining exploration/development, cash income tax, working-capital delta and other recurring non-EBITDA cash spend.',
      'Reported FCF can be displayed separately but does not become canonical FCFF unless its definition is bridged explicitly.',
    ],
  };

  const afterGrowthMissing = [...preGrowthMissing];
  for (const component of GROWTH_COMPONENTS) afterGrowthMissing.push(...projectCostMissing(producer, activeProjects, component, year));
  const afterGrowth: ProducerCalculabilityResult = {
    metric: 'FCFF efter growth',
    state: afterGrowthMissing.length === 0 ? (hasRange ? 'range_only' : 'calculable') : (reportedFcf ? 'reported_only' : 'blocked'),
    missing: [...new Set(afterGrowthMissing)],
    notes: ['Requires FCFF före growth plus growth CAPEX and growth exploration/development.'],
  };

  const balance = producer.valuation.balanceSheet;
  const evMissing: string[] = [];
  if (!balance) evMissing.push('valuation.balanceSheet');
  else {
    if (!balance.cashAndEquivalents) evMissing.push('valuation.balanceSheet.cashAndEquivalents');
    if (!balance.totalDebt) evMissing.push('valuation.balanceSheet.totalDebt');
    if (balance.usability === 'stale_after_material_event') evMissing.push('valuation.balanceSheet.usability: current post-event balance required');
  }
  const ev: ProducerCalculabilityResult = {
    metric: 'EV',
    state: evMissing.length === 0 ? 'calculable' : 'blocked',
    missing: evMissing,
    notes: ['Current market cap/price/FX are hydrated at runtime. JSON supplies the latest usable debt/cash/NCI/lease/investment bridge.'],
  };

  return { year, caseMode, metrics: [au, revenue, ebitda, preGrowth, afterGrowth, ev] };
}

export function assessProducerFiveYearCoverage(
  producer: ProducerJsonV1,
  startYear: number,
  caseMode: ProducerCaseMode = 'BASE',
): ProducerYearCalculability[] {
  return Array.from({ length: 5 }, (_, offset) => assessProducerYearCalculability(producer, startYear + offset, caseMode));
}
