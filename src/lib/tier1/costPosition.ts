import { buildBatch6PublicCuPilotCurve } from './publicCuCostCurveBatch6.ts';

export type Tier1CostEvidenceClass =
  | 'ACTUAL_OPERATION'
  | 'FS_ESTIMATE'
  | 'PFS_ESTIMATE'
  | 'PEA_ESTIMATE'
  | 'OTHER_ESTIMATE'
  | 'UNKNOWN';

export type Tier1CostReferencePosition =
  | 'BELOW_Q1_REFERENCE'
  | 'Q1_TO_P50_REFERENCE'
  | 'P50_TO_Q3_REFERENCE'
  | 'ABOVE_Q3_REFERENCE'
  | 'UNAVAILABLE';

export type Tier1CostReferenceComparability =
  | 'DIRECT_REFERENCE'
  | 'REFERENCE_ONLY'
  | 'NOT_COMPARABLE';

export type Tier1CostReference = {
  id: string;
  metric: string;
  dataYear: number;
  q1Max: number;
  p50Max: number;
  p75Max: number;
  unit: string;
  sourceRole: 'RESEARCH_ONLY' | 'ACTIVATED_BENCHMARK';
  activationAllowed: boolean;
};

export type Tier1CostPositionAssessment = {
  status: 'ASSESSED' | 'NOT_VERIFIED';
  measuredCost: number | null;
  measuredCostUnit: string | null;
  costBaseYear: number | null;
  costEvidenceClass: Tier1CostEvidenceClass;
  referenceId: string;
  referenceDataYear: number;
  rawReferencePosition: Tier1CostReferencePosition;
  comparability: Tier1CostReferenceComparability;
  adjustedCost: null;
  adjustmentApplied: false;
  hardTier: null;
  reason: string;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validYear(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1900 && (value as number) <= 2100;
}

function rawPosition(value: number, reference: Tier1CostReference): Tier1CostReferencePosition {
  if (value <= reference.q1Max) return 'BELOW_Q1_REFERENCE';
  if (value <= reference.p50Max) return 'Q1_TO_P50_REFERENCE';
  if (value <= reference.p75Max) return 'P50_TO_Q3_REFERENCE';
  return 'ABOVE_Q3_REFERENCE';
}

/**
 * Cost-position reference layer introduced after the 2026-09-02 methodology pivot.
 *
 * This function deliberately does NOT inflation-adjust, FX-rebase or otherwise
 * transform the project's measured cost to the reference year. It preserves the
 * mine/report measurement exactly and only describes where that number sits
 * against a reference curve. Technical-study estimates and vintage mismatches are
 * reference-only unless a later, explicit empirical calibration policy is adopted.
 *
 * The output intentionally has hardTier=null. This layer cannot activate Tier.
 */
export function assessCostPositionAgainstReference(args: {
  value: number;
  unit: string;
  costBaseYear: number | null;
  costEvidenceClass: Tier1CostEvidenceClass;
  reference: Tier1CostReference;
}): Tier1CostPositionAssessment {
  const { reference } = args;
  const boundariesValid = finite(reference.q1Max)
    && finite(reference.p50Max)
    && finite(reference.p75Max)
    && reference.q1Max <= reference.p50Max
    && reference.p50Max <= reference.p75Max;

  if (!finite(args.value) || !boundariesValid || !validYear(reference.dataYear)) {
    return {
      status: 'NOT_VERIFIED', measuredCost: finite(args.value) ? args.value : null,
      measuredCostUnit: args.unit || null, costBaseYear: validYear(args.costBaseYear) ? args.costBaseYear : null,
      costEvidenceClass: args.costEvidenceClass, referenceId: reference.id,
      referenceDataYear: reference.dataYear, rawReferencePosition: 'UNAVAILABLE',
      comparability: 'NOT_COMPARABLE', adjustedCost: null, adjustmentApplied: false,
      hardTier: null, reason: 'Kostnad eller referensgränser är inte verifierbara. Ingen cost-position antas.',
    };
  }

  const position = rawPosition(args.value, reference);
  if (!validYear(args.costBaseYear)) {
    return {
      status: 'ASSESSED', measuredCost: args.value, measuredCostUnit: args.unit,
      costBaseYear: null, costEvidenceClass: args.costEvidenceClass,
      referenceId: reference.id, referenceDataYear: reference.dataYear,
      rawReferencePosition: position, comparability: 'NOT_COMPARABLE',
      adjustedCost: null, adjustmentApplied: false, hardTier: null,
      reason: `Rå referensposition kan visas (${position}), men costBaseYear saknas. Ingen vintagejustering antas och ingen Tier slutsats dras.`,
    };
  }

  if (args.costEvidenceClass === 'UNKNOWN') {
    return {
      status: 'ASSESSED', measuredCost: args.value, measuredCostUnit: args.unit,
      costBaseYear: args.costBaseYear, costEvidenceClass: args.costEvidenceClass,
      referenceId: reference.id, referenceDataYear: reference.dataYear,
      rawReferencePosition: position, comparability: 'NOT_COMPARABLE',
      adjustedCost: null, adjustmentApplied: false, hardTier: null,
      reason: `Rå referensposition kan visas (${position}), men costEvidenceClass är UNKNOWN. Kostnaden lämnas oförändrad och ingen Tier slutsats dras.`,
    };
  }

  const sameVintage = args.costBaseYear === reference.dataYear;
  const actualOperation = args.costEvidenceClass === 'ACTUAL_OPERATION';
  const direct = reference.activationAllowed && reference.sourceRole === 'ACTIVATED_BENCHMARK' && sameVintage && actualOperation;

  if (direct) {
    return {
      status: 'ASSESSED', measuredCost: args.value, measuredCostUnit: args.unit,
      costBaseYear: args.costBaseYear, costEvidenceClass: args.costEvidenceClass,
      referenceId: reference.id, referenceDataYear: reference.dataYear,
      rawReferencePosition: position, comparability: 'DIRECT_REFERENCE',
      adjustedCost: null, adjustmentApplied: false, hardTier: null,
      reason: `Samma cost-vintage och ACTUAL_OPERATION mot aktiverad referens. Rå position ${position}. Detta lager beskriver position men sätter fortfarande inte Tier.`,
    };
  }

  const blockers: string[] = [];
  if (reference.sourceRole === 'RESEARCH_ONLY' || !reference.activationAllowed) blockers.push('referensen är research-only');
  if (!actualOperation) blockers.push(`${args.costEvidenceClass} är en teknisk/annan kostnadsestimatklass, inte actual operation`);
  if (!sameVintage) blockers.push(`cost vintage ${args.costBaseYear} skiljer sig från referensåret ${reference.dataYear}`);

  return {
    status: 'ASSESSED', measuredCost: args.value, measuredCostUnit: args.unit,
    costBaseYear: args.costBaseYear, costEvidenceClass: args.costEvidenceClass,
    referenceId: reference.id, referenceDataYear: reference.dataYear,
    rawReferencePosition: position, comparability: 'REFERENCE_ONLY',
    adjustedCost: null, adjustmentApplied: false, hardTier: null,
    reason: `Rå referensposition ${position}. ${blockers.join('; ')}. Projektkostnaden rebases inte till referensåret; ingen syntetisk inflation/FX eller egen tolerans läggs på.`,
  };
}

export function buildPublicCu2024CostPositionReference(): Tier1CostReference | null {
  const curve = buildBatch6PublicCuPilotCurve();
  if (curve.status !== 'RESEARCH_CURVE_READY' || curve.q1Max === null || curve.p50Max === null || curve.p75Max === null) return null;
  return {
    id: 'PUBLIC_CU_2024_RESEARCH_CURVE_BATCH6',
    metric: 'TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED',
    dataYear: 2024,
    q1Max: curve.q1Max,
    p50Max: curve.p50Max,
    p75Max: curve.p75Max,
    unit: 'USD/lb contained Cu',
    sourceRole: 'RESEARCH_ONLY',
    activationAllowed: false,
  };
}
