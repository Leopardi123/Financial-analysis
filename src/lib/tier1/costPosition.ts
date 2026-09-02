import { buildBatch6PublicCuPilotCurve } from './publicCuCostCurveBatch6.ts';

export const TIER_PUBLIC_CU_COST_POSITION_METRIC = 'TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED' as const;

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
  denominatorLabel: string;
  sourceRole: 'RESEARCH_ONLY' | 'ACTIVATED_BENCHMARK';
  activationAllowed: boolean;
};

export type Tier1CostPositionAssessment = {
  status: 'ASSESSED' | 'NOT_VERIFIED';
  measuredMetric: string;
  measuredCost: number | null;
  measuredCostUnit: string | null;
  costBaseYear: number | null;
  costEvidenceClass: Tier1CostEvidenceClass;
  referenceId: string;
  referenceMetric: string;
  referenceDataYear: number;
  rawReferencePosition: Tier1CostReferencePosition;
  comparability: Tier1CostReferenceComparability;
  adjustedCost: null;
  adjustmentApplied: false;
  hardTier: null;
  reason: string;
};

const TECHNICAL_REPORT_EVIDENCE_CLASS_BY_SOURCE_ID: Readonly<Record<string, Tier1CostEvidenceClass>> = {
  'vizcachitas-pfs-2023': 'PFS_ESTIMATE',
  'berg-pfs-2026': 'PFS_ESTIMATE',
  'warintza-pfs-2025': 'PFS_ESTIMATE',
  'arctic-fs-2023': 'FS_ESTIMATE',
  'copper-creek-pea-2023': 'PEA_ESTIMATE',
};

export function technicalReportCostEvidenceClass(sourceId: string | null | undefined): Tier1CostEvidenceClass {
  if (!sourceId) return 'UNKNOWN';
  return TECHNICAL_REPORT_EVIDENCE_CLASS_BY_SOURCE_ID[sourceId] ?? 'UNKNOWN';
}

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

function base(args: {
  measuredMetric: string;
  value: number | null;
  unit: string | null;
  costBaseYear: number | null;
  costEvidenceClass: Tier1CostEvidenceClass;
  reference: Tier1CostReference;
}): Omit<Tier1CostPositionAssessment, 'status' | 'rawReferencePosition' | 'comparability' | 'reason'> {
  return {
    measuredMetric: args.measuredMetric,
    measuredCost: args.value,
    measuredCostUnit: args.unit,
    costBaseYear: args.costBaseYear,
    costEvidenceClass: args.costEvidenceClass,
    referenceId: args.reference.id,
    referenceMetric: args.reference.metric,
    referenceDataYear: args.reference.dataYear,
    adjustedCost: null,
    adjustmentApplied: false,
    hardTier: null,
  };
}

/**
 * Reference-position layer introduced after the 2026-09-02 methodology pivot.
 *
 * The project's measured cost is never inflation-adjusted, FX-rebased or otherwise
 * transformed to the reference year. Before even showing a raw relation to Q1/P50/P75,
 * the project metric and unit must match the reference exactly. Similar labels are not
 * enough: a payable-Cu C1, by-product C1 or report-defined C1 must not be placed on the
 * public contained-Cu/co-product curve unless it has explicitly been reconstructed into
 * that exact research metric.
 *
 * Technical-study estimates and vintage mismatches are reference-only. The output always
 * has hardTier=null, so this layer cannot activate Tier by accident.
 */
export function assessCostPositionAgainstReference(args: {
  measuredMetric: string;
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
  const common = base({
    measuredMetric: args.measuredMetric,
    value: finite(args.value) ? args.value : null,
    unit: args.unit || null,
    costBaseYear: validYear(args.costBaseYear) ? args.costBaseYear : null,
    costEvidenceClass: args.costEvidenceClass,
    reference,
  });

  if (!finite(args.value) || !boundariesValid || !validYear(reference.dataYear)) {
    return {
      ...common,
      status: 'NOT_VERIFIED', rawReferencePosition: 'UNAVAILABLE', comparability: 'NOT_COMPARABLE',
      reason: 'Kostnad eller referensgränser är inte verifierbara. Ingen cost-position antas.',
    };
  }

  if (args.measuredMetric !== reference.metric) {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: 'UNAVAILABLE', comparability: 'NOT_COMPARABLE',
      reason: `Metric mismatch: projektet mäter ${args.measuredMetric}, medan referensen kräver ${reference.metric}. Ingen rå Q1/P50/P75-position visas och ingen ometikettering görs.`,
    };
  }

  if (args.unit !== reference.unit) {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: 'UNAVAILABLE', comparability: 'NOT_COMPARABLE',
      reason: `Unit mismatch: projektet använder ${args.unit || 'okänd enhet'}, medan referensen kräver ${reference.unit}. Ingen implicit enhets-/definitionskonvertering görs.`,
    };
  }

  const position = rawPosition(args.value, reference);
  if (!validYear(args.costBaseYear)) {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: position, comparability: 'NOT_COMPARABLE',
      reason: `Rå referensposition kan visas (${position}), men costBaseYear saknas. Ingen vintagejustering antas och ingen Tier-slutsats dras.`,
    };
  }

  if (args.costEvidenceClass === 'UNKNOWN') {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: position, comparability: 'NOT_COMPARABLE',
      reason: `Rå referensposition kan visas (${position}), men costEvidenceClass är UNKNOWN. Kostnaden lämnas oförändrad och ingen Tier-slutsats dras.`,
    };
  }

  const sameVintage = args.costBaseYear === reference.dataYear;
  const actualOperation = args.costEvidenceClass === 'ACTUAL_OPERATION';
  const direct = reference.activationAllowed && reference.sourceRole === 'ACTIVATED_BENCHMARK' && sameVintage && actualOperation;

  if (direct) {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: position, comparability: 'DIRECT_REFERENCE',
      reason: `Samma cost-vintage och ACTUAL_OPERATION mot aktiverad referens. Rå position ${position}. Detta lager beskriver position men sätter fortfarande inte Tier.`,
    };
  }

  const blockers: string[] = [];
  if (reference.sourceRole === 'RESEARCH_ONLY' || !reference.activationAllowed) blockers.push('referensen är research-only');
  if (!actualOperation) blockers.push(`${args.costEvidenceClass} är en teknisk/annan kostnadsestimatklass, inte actual operation`);
  if (!sameVintage) blockers.push(`cost vintage ${args.costBaseYear} skiljer sig från referensåret ${reference.dataYear}`);

  return {
    ...common,
    status: 'ASSESSED', rawReferencePosition: position, comparability: 'REFERENCE_ONLY',
    reason: `Rå referensposition ${position}. ${blockers.join('; ')}. Projektkostnaden rebases inte till referensåret; ingen syntetisk inflation/FX eller egen tolerans läggs på.`,
  };
}

export function buildPublicCu2024CostPositionReference(): Tier1CostReference | null {
  const curve = buildBatch6PublicCuPilotCurve();
  if (curve.status !== 'RESEARCH_CURVE_READY' || curve.q1Max === null || curve.p50Max === null || curve.p75Max === null) return null;
  return {
    id: 'PUBLIC_CU_2024_RESEARCH_CURVE_BATCH6',
    metric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
    dataYear: 2024,
    q1Max: curve.q1Max,
    p50Max: curve.p50Max,
    p75Max: curve.p75Max,
    unit: 'USD/lb',
    denominatorLabel: 'contained Cu',
    sourceRole: 'RESEARCH_ONLY',
    activationAllowed: false,
  };
}
