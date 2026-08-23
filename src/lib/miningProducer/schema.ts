import type {
  ForecastCostRule,
  ForecastProductionRule,
  ProducerJsonV1,
  ProducerRunContext,
  Provenance,
} from './types.ts';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FORECAST_ESTIMATE_CLASSES = new Set(['scenario', 'analyst_consensus', 'derived', 'mine_plan_derived']);

export function assertValuationDateUtc(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw new Error('valuationDateUtc must be an explicit YYYY-MM-DD UTC date');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('valuationDateUtc must be a valid calendar date');
  }
}

export function validateProducerRunContext(context: ProducerRunContext): ProducerRunContext {
  assertValuationDateUtc(context.valuationDateUtc);

  if (!Number.isInteger(context.selectedYear)) {
    throw new Error('selectedYear must be an integer');
  }

  if (!['SPOT', 'LT', 'REPORTED'].includes(context.priceMode)) {
    throw new Error(`Unsupported producer priceMode: ${String(context.priceMode)}`);
  }

  if (!['BASE', 'GROWTH'].includes(context.caseMode)) {
    throw new Error(`Unsupported producer caseMode: ${String(context.caseMode)}`);
  }

  return { ...context };
}

function validateForecastYears(ruleId: string, appliesTo: { startYear: number; endYear: number }): void {
  if (!Number.isInteger(appliesTo.startYear) || !Number.isInteger(appliesTo.endYear)) {
    throw new Error(`forecast rule ${ruleId} appliesTo.startYear/endYear must be integers`);
  }
  if (appliesTo.endYear < appliesTo.startYear) {
    throw new Error(`forecast rule ${ruleId} ends before it starts`);
  }
}

function validateForecastProvenance(ruleId: string, provenance: Provenance): void {
  if (!provenance?.sourceId) throw new Error(`forecast rule ${ruleId} provenance.sourceId is required`);
  if (!FORECAST_ESTIMATE_CLASSES.has(provenance.estimateClass)) {
    throw new Error(`forecast rule ${ruleId} must use estimateClass scenario, analyst_consensus, derived or mine_plan_derived; source facts belong in the evidence arrays`);
  }
}

function validateForecastProductionRules(project: ProducerJsonV1['projects'][number], rules: readonly ForecastProductionRule[]): void {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (!rule.id || ids.has(rule.id)) throw new Error(`forecast production rule ids must be unique within project ${project.id}: ${rule.id}`);
    ids.add(rule.id);
    validateForecastYears(rule.id, rule.appliesTo);
    validateForecastProvenance(rule.id, rule.provenance);

    if (rule.method === 'carry_forward') {
      if (!Number.isFinite(rule.annualChangePct) || rule.annualChangePct <= -1) {
        throw new Error(`forecast production rule ${rule.id} annualChangePct must be finite and greater than -1`);
      }
      const source = project.production.find((item) => item.id === rule.sourceDisclosureId);
      if (!source) throw new Error(`forecast production rule ${rule.id} sourceDisclosureId ${rule.sourceDisclosureId} not found in project ${project.id}`);
      if (source.period.kind !== 'year') throw new Error(`forecast production rule ${rule.id} carry_forward source must be an exact-year disclosure`);
      if (rule.appliesTo.startYear < source.period.year) throw new Error(`forecast production rule ${rule.id} cannot carry ${source.period.year} backwards into ${rule.appliesTo.startYear}`);
    } else if (rule.method === 'periodize_source') {
      const source = project.production.find((item) => item.id === rule.sourceDisclosureId);
      if (!source) throw new Error(`forecast production rule ${rule.id} sourceDisclosureId ${rule.sourceDisclosureId} not found in project ${project.id}`);
      if (source.period.kind === 'year_range_total' && rule.quantity === undefined) {
        throw new Error(`forecast production rule ${rule.id} must provide an explicit quantity when periodizing a year_range_total`);
      }
    }
  }
}

function validateForecastCostRules(
  scopeLabel: string,
  sourceCosts: readonly NonNullable<ProducerJsonV1['corporateCosts']>,
  rules: readonly ForecastCostRule[],
  requireCompanyBasis: boolean,
): void {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (!rule.id || ids.has(rule.id)) throw new Error(`forecast cost rule ids must be unique within ${scopeLabel}: ${rule.id}`);
    ids.add(rule.id);
    validateForecastYears(rule.id, rule.appliesTo);
    validateForecastProvenance(rule.id, rule.provenance);

    if (rule.method === 'carry_forward') {
      if (!Number.isFinite(rule.annualEscalationPct) || rule.annualEscalationPct <= -1) {
        throw new Error(`forecast cost rule ${rule.id} annualEscalationPct must be finite and greater than -1`);
      }
      const source = sourceCosts.find((item) => item.id === rule.sourceCostId);
      if (!source) throw new Error(`forecast cost rule ${rule.id} sourceCostId ${rule.sourceCostId} not found in ${scopeLabel}`);
      if (source.period.kind !== 'year') throw new Error(`forecast cost rule ${rule.id} carry_forward source must be an exact-year cost`);
      if (source.model.type === 'derived') throw new Error(`forecast cost rule ${rule.id} cannot carry forward an unresolved derived cost model`);
      if (source.model.type === 'percent_revenue' && Math.abs(rule.annualEscalationPct) > 1e-12) {
        throw new Error(`forecast cost rule ${rule.id} percent_revenue source requires annualEscalationPct=0; change the rate with an explicit rule instead`);
      }
      if (rule.appliesTo.startYear < source.period.year) throw new Error(`forecast cost rule ${rule.id} cannot carry ${source.period.year} backwards into ${rule.appliesTo.startYear}`);
    } else if (requireCompanyBasis && rule.economicBasis !== 'company') {
      throw new Error(`top-level forecast corporate cost rule ${rule.id} must use economicBasis=company`);
    }
  }
}

export function validateProducerJsonV1(input: ProducerJsonV1): ProducerJsonV1 {
  if (input.version !== 'producer_json_v1') {
    throw new Error('Producer payload version must be producer_json_v1');
  }
  if (!input.company?.id || !input.company?.name) {
    throw new Error('Producer company id and name are required');
  }
  assertValuationDateUtc(input.valuation?.valuationDateUtc);
  if (!Array.isArray(input.projects)) {
    throw new Error('Producer projects must be an array');
  }
  if (!Array.isArray(input.sources)) {
    throw new Error('Producer sources must be an array');
  }

  for (const project of input.projects) {
    if (project.productionWindow) {
      const { startYear, endYear } = project.productionWindow;
      if (!Number.isInteger(startYear)) {
        throw new Error(`productionWindow.startYear for project ${project.id} must be an integer`);
      }
      if (endYear !== undefined && !Number.isInteger(endYear)) {
        throw new Error(`productionWindow.endYear for project ${project.id} must be an integer when provided`);
      }
      if (endYear !== undefined && endYear < startYear) {
        throw new Error(`productionWindow for project ${project.id} ends before it starts`);
      }
    }

    if (project.financialConsolidation) {
      const { method, consolidationPct } = project.financialConsolidation;
      if (!['full', 'proportionate', 'equity_method'].includes(method)) {
        throw new Error(`Unsupported financialConsolidation.method for project ${project.id}`);
      }
      if (method === 'full' && consolidationPct !== undefined && consolidationPct !== 1) {
        throw new Error(`financialConsolidation.consolidationPct for full project ${project.id} must be omitted or 1`);
      }
      if (method === 'proportionate') {
        if (!Number.isFinite(consolidationPct) || (consolidationPct as number) < 0 || (consolidationPct as number) > 1) {
          throw new Error(`financialConsolidation.consolidationPct for proportionate project ${project.id} must be between 0 and 1`);
        }
      }
      if (method === 'equity_method' && consolidationPct !== undefined && consolidationPct !== 0) {
        throw new Error(`financialConsolidation.consolidationPct for equity_method project ${project.id} must be omitted or 0`);
      }
    }

    for (const ownership of project.ownership) {
      if (!Number.isFinite(ownership.ownershipPct) || ownership.ownershipPct < 0 || ownership.ownershipPct > 1) {
        throw new Error(`ownershipPct for project ${project.id} must be between 0 and 1`);
      }
    }

    validateForecastProductionRules(project, project.forecastAssumptions?.production ?? []);
    validateForecastCostRules(project.id, project.costs ?? [], project.forecastAssumptions?.costs ?? [], false);
  }

  validateForecastCostRules('company', input.corporateCosts ?? [], input.forecastAssumptions?.corporateCosts ?? [], true);

  return input;
}
