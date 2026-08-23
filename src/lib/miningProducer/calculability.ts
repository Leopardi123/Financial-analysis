import { resolveOwnershipForYear } from './ownership.ts';
import { isProjectIncludedInCase } from './production.ts';
import type { CostComponent, CostDisclosure, ProducerCaseMode, ProducerJsonV1, ProducerProject, ProductionDisclosure } from './types.ts';

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

const GROWTH_COMPONENTS: CostComponent[] = ['growth_capex', 'growth_exploration'];

function exactYearPeriod(period: CostDisclosure['period'] | ProducerProject['production'][number]['period'], year: number): boolean {
  return period.kind === 'year' && period.year === year;
}

function projectIsEconomicallyActive(project: ProducerProject, year: number, caseMode: ProducerCaseMode): boolean {
  if (!isProjectIncludedInCase(project.statusAsOfValuationDate, caseMode)) return false;
  const window = project.productionWindow;
  if (!window) return true;
  if (year < window.startYear) return false;
  if (window.endYear !== undefined && year > window.endYear) return false;
  return true;
}

function ownershipAvailable(project: ProducerProject, year: number): boolean {
  return resolveOwnershipForYear(project.ownership, year).status === 'exact';
}

function sourceCanResolveAttributable(project: ProducerProject, disclosure: ProductionDisclosure, year: number): boolean {
  return disclosure.basis === 'attributable' || ownershipAvailable(project, year);
}

function sourceCanResolveFinancial(project: ProducerProject, disclosure: ProductionDisclosure, year: number): boolean {
  const consolidation = project.financialConsolidation;
  if (disclosure.basis === 'attributable') {
    if (!ownershipAvailable(project, year)) return false;
    if (!consolidation) return true;
  }
  if (consolidation) {
    if (consolidation.method === 'full' || consolidation.method === 'equity_method') return true;
    return Number.isFinite(consolidation.consolidationPct);
  }
  const ownership = resolveOwnershipForYear(project.ownership, year);
  return ownership.status === 'exact' && ownership.ownershipPct === 1;
}

function claimIsClosedRange(disclosure: ProductionDisclosure): boolean {
  return disclosure.quantity.kind === 'range';
}

function claimIsOpenBound(disclosure: ProductionDisclosure): boolean {
  return disclosure.quantity.kind === 'upper_bound' || disclosure.quantity.kind === 'lower_bound';
}

function projectAttributableProductionStatus(project: ProducerProject, year: number): { state: 'scalar' | 'range' | 'missing'; missing: string[]; notes: string[] } {
  const exactProduced = project.production.filter((item) => item.measure === 'produced' && exactYearPeriod(item.period, year));
  const nonAnnualEvidence = project.production.filter((item) =>
    item.measure === 'produced'
    && item.period.kind !== 'year'
    && item.period.kind !== 'not_periodized'
    && year >= item.period.startYear
    && year <= item.period.endYear,
  );

  if (exactProduced.length === 0) {
    return {
      state: 'missing',
      missing: [`projects[${project.id}].production: exact-year produced disclosure for ${year}, or productionWindow proving the project is non-producing in ${year}`],
      notes: nonAnnualEvidence.length > 0
        ? [`${project.id}: multi-year average/total covers ${year} but is evidence only and is not materialized into an annual value.`]
        : [],
    };
  }

  const missing: string[] = [];
  const notes: string[] = [];
  let hasClosedRange = false;
  for (const disclosure of exactProduced) {
    if (!sourceCanResolveAttributable(project, disclosure, year)) {
      missing.push(`projects[${project.id}].ownership: exact ownership period covering ${year} is required for project_100pct production`);
    }
    if (claimIsClosedRange(disclosure)) hasClosedRange = true;
    if (claimIsOpenBound(disclosure)) {
      missing.push(`projects[${project.id}].production[${disclosure.id}]: ${disclosure.quantity.kind} is open-ended; provide a source-backed closed range/point for interval economics or keep it as evidence only`);
    }
  }
  if (missing.length > 0) return { state: 'missing', missing: [...new Set(missing)], notes };
  return { state: hasClosedRange ? 'range' : 'scalar', missing: [], notes };
}

function projectFinancialRevenueMissing(project: ProducerProject, year: number): string[] {
  const rows = project.production.filter((item) => exactYearPeriod(item.period, year));
  if (rows.length === 0) {
    return [`projects[${project.id}].production: exact-year payable/sold/produced revenue quantity for ${year}, or productionWindow proving non-production`];
  }
  const missing: string[] = [];
  const metals = [...new Set(rows.map((item) => item.metal))];
  for (const metal of metals) {
    let selected: ProductionDisclosure | null = null;
    for (const measure of ['payable', 'sold', 'produced'] as const) {
      const candidates = rows.filter((item) => item.metal === metal && item.measure === measure);
      if (candidates.length > 1) {
        missing.push(`projects[${project.id}].production: multiple ${measure} disclosures for ${metal}/${year}; source precedence must be resolved`);
        selected = null;
        break;
      }
      if (candidates.length === 1) {
        selected = candidates[0];
        break;
      }
    }
    if (!selected) {
      missing.push(`projects[${project.id}].production: payable/sold/produced quantity for ${metal}/${year}`);
      continue;
    }
    if (claimIsOpenBound(selected)) {
      missing.push(`projects[${project.id}].production[${selected.id}]: open-ended quantity cannot produce a closed Revenue interval`);
    }
    if (!sourceCanResolveFinancial(project, selected, year)) {
      missing.push(`projects[${project.id}].financialConsolidation: required for ${year} when project_100pct production is not clearly 100%-owned/consolidated; use full, proportionate+consolidationPct, or equity_method with provenance`);
    }
  }
  return [...new Set(missing)];
}

function costCovers(cost: CostDisclosure, component: CostComponent, year: number): boolean {
  if (!exactYearPeriod(cost.period, year)) return false;
  return cost.component === component || (cost.definition?.includesComponents ?? []).includes(component);
}

function costComponentCoveredAtCompanyLevel(producer: ProducerJsonV1, component: CostComponent, year: number): boolean {
  return (producer.corporateCosts ?? []).some((cost) => costCovers(cost, component, year));
}

function projectCostMissing(producer: ProducerJsonV1, projects: ProducerProject[], component: CostComponent, year: number): string[] {
  if (costComponentCoveredAtCompanyLevel(producer, component, year)) return [];
  const missing: string[] = [];
  for (const project of projects) {
    const has = (project.costs ?? []).some((cost) => costCovers(cost, component, year));
    if (!has) missing.push(`projects[${project.id}].costs: ${component} for ${year}, a composite cost whose definition.includesComponents contains ${component}, or one company-level corporateCosts replacement`);
  }
  return missing;
}

function sustainingDevelopmentMissing(producer: ProducerJsonV1, projects: ProducerProject[], year: number): string[] {
  const alternatives: CostComponent[] = ['sustaining_exploration', 'deferred_stripping', 'underground_development'];
  const companyCovered = alternatives.some((component) => costComponentCoveredAtCompanyLevel(producer, component, year));
  if (companyCovered) return [];
  const missing: string[] = [];
  for (const project of projects) {
    const has = (project.costs ?? []).some((cost) => alternatives.some((component) => costCovers(cost, component, year)));
    if (!has) missing.push(`projects[${project.id}].costs: sustaining exploration/deferred stripping/underground development coverage for ${year}, or explicit source-backed zero/non-applicability`);
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
  const productionStates = activeProjects.map((project) => ({ project, status: projectAttributableProductionStatus(project, year) }));
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
    missing: [...new Set(productionMissing)],
    notes: [
      ...productionNotes,
      ...(reportedProduction && productionMissing.length > 0
        ? ['Company-level reported production exists and can be displayed, but it does not repair missing canonical attributable project production.']
        : []),
    ],
  };

  const revenueMissing = activeProjects.flatMap((project) => projectFinancialRevenueMissing(project, year));
  const revenueState: ProducerCalculabilityState = revenueMissing.length === 0
    ? (hasRange ? 'range_only' : 'calculable')
    : (companyReportedMetricExists(producer, 'revenue', year) || reportedProduction ? 'reported_only' : 'blocked');
  const revenue: ProducerCalculabilityResult = {
    metric: 'Revenue',
    state: revenueState,
    missing: [...new Set(revenueMissing)],
    notes: [
      'SPOT/LT metal prices are runtime inputs and do not need to be stored in producer_json_v1.',
      'Revenue uses payable > sold > produced by metal. produced is allowed only as an explicitly marked approximation.',
      'Attributable ownership and financial consolidation are separate. A less-than-100%-owned fully consolidated mine should use financialConsolidation.method=full rather than shrinking financial Revenue to equity ownership.',
    ],
  };

  const ebitdaMissing = [...revenueMissing];
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
      'A composite cost can satisfy several required components only when CostDisclosure.definition.includesComponents names them explicitly; the composite amount is then counted once.',
      'A net-of-byproduct per-unit cost can be used by the interval engine only when no separate byproduct production/revenue is modeled for that project/year. Otherwise it is blocked against double counting.',
    ],
  };

  const preGrowthMissing = [...ebitdaMissing];
  preGrowthMissing.push(...projectCostMissing(producer, activeProjects, 'sustaining_capex', year));
  preGrowthMissing.push(...sustainingDevelopmentMissing(producer, activeProjects, year));
  preGrowthMissing.push(...projectCostMissing(producer, activeProjects, 'cash_income_tax', year));
  preGrowthMissing.push(...projectCostMissing(producer, activeProjects, 'working_capital_delta', year));
  preGrowthMissing.push(...projectCostMissing(producer, activeProjects, 'other_cash', year));
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
