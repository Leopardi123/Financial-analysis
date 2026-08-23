import type { ProducerJsonV1, ProducerRunContext } from './types.ts';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  }

  return input;
}
