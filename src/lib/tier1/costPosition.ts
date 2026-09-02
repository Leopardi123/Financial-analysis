import { TIER1_COST_BENCHMARKS } from './config.ts';
import type { Tier1CostNormalizationResult } from './costNormalization.ts';
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

export type Tier1CostSemanticCompatibility = {
  status: 'COMPATIBLE_FOR_RAW_REFERENCE' | 'NOT_COMPARABLE';
  blockers: string[];
};

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
  limitations?: string[];
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
  semanticBlockers: string[];
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
}): Omit<Tier1CostPositionAssessment, 'status' | 'rawReferencePosition' | 'comparability' | 'semanticBlockers' | 'reason'> {
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
 * High-level semantic compatibility with the public evidence that is actually
 * known for S&P's 2024 Cu C1 curve. This deliberately does not claim the full
 * proprietary S&P contract is known. It answers only whether a source-locked
 * project normalization is structurally eligible for a raw contextual read-off.
 */
export function assessSAndPCuRawReferenceCompatibility(
  normalized: Tier1CostNormalizationResult,
): Tier1CostSemanticCompatibility {
  if (normalized.status !== 'NORMALIZED') {
    return { status: 'NOT_COMPARABLE', blockers: [`project cost normalization: ${normalized.reason}`] };
  }

  const blockers: string[] = [];
  if (normalized.metric !== 'C1_CU_USD_PER_LB') blockers.push(`metric ${normalized.metric} is not Cu C1`);
  if (normalized.basis !== 'co_product') blockers.push(`cost basis ${normalized.basis} is not co_product`);
  if (normalized.denominator.product !== 'Cu') blockers.push(`denominator product ${normalized.denominator.product} is not Cu`);
  if (normalized.denominator.basis !== 'payable_primary_metal') blockers.push(`denominator basis ${normalized.denominator.basis} is not payable Cu`);
  if (normalized.denominator.unit !== 'lb' || normalized.unit !== 'USD/lb') blockers.push('denominator/output unit is not lb / USD/lb');
  if (normalized.sourceConflicts.length > 0) blockers.push('unresolved source conflicts');

  return blockers.length === 0
    ? { status: 'COMPATIBLE_FOR_RAW_REFERENCE', blockers: [] }
    : { status: 'NOT_COMPARABLE', blockers };
}

/**
 * Reference-position layer introduced after the 2026-09-02 methodology pivot.
 *
 * Metric ids are evidence labels, not the compatibility test. The caller first
 * supplies an explicit semantic compatibility result derived from the source-
 * locked normalization (basis, denominator, unit, conflicts etc.). Only then may
 * this function show an unadjusted raw relation to Q1/P50/P75.
 *
 * The measured project cost is never CPI/FX/vintage rebased. Technical-study
 * estimates, vintage mismatches and reference-method limitations remain contextual
 * only. hardTier is always null.
 */
export function assessCostPositionAgainstReference(args: {
  measuredMetric: string;
  value: number;
  unit: string;
  costBaseYear: number | null;
  costEvidenceClass: Tier1CostEvidenceClass;
  semanticCompatibility: Tier1CostSemanticCompatibility;
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
      semanticBlockers: [...args.semanticCompatibility.blockers],
      reason: 'Kostnad eller referensgränser är inte verifierbara. Ingen cost-position antas.',
    };
  }

  if (args.semanticCompatibility.status !== 'COMPATIBLE_FOR_RAW_REFERENCE') {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: 'UNAVAILABLE', comparability: 'NOT_COMPARABLE',
      semanticBlockers: [...args.semanticCompatibility.blockers],
      reason: `Semantisk mismatch: ${args.semanticCompatibility.blockers.join('; ')}. Metricnamnet används endast som etikett; ingen ometikettering eller dold definitionskonvertering görs.`,
    };
  }

  if (args.unit !== reference.unit) {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: 'UNAVAILABLE', comparability: 'NOT_COMPARABLE',
      semanticBlockers: [`unit ${args.unit || 'unknown'} != ${reference.unit}`],
      reason: `Enhetsmismatch: projektet använder ${args.unit || 'okänd enhet'}, medan referensen kräver ${reference.unit}. Ingen implicit konvertering görs.`,
    };
  }

  const position = rawPosition(args.value, reference);
  if (!validYear(args.costBaseYear)) {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: position, comparability: 'NOT_COMPARABLE', semanticBlockers: [],
      reason: `Rå referensposition kan visas (${position}), men costBaseYear saknas. Ingen vintagejustering antas och ingen Tier-slutsats dras.`,
    };
  }

  if (args.costEvidenceClass === 'UNKNOWN') {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: position, comparability: 'NOT_COMPARABLE', semanticBlockers: [],
      reason: `Rå referensposition kan visas (${position}), men costEvidenceClass är UNKNOWN. Kostnaden lämnas oförändrad och ingen Tier-slutsats dras.`,
    };
  }

  const sameVintage = args.costBaseYear === reference.dataYear;
  const actualOperation = args.costEvidenceClass === 'ACTUAL_OPERATION';
  const limitations = [...(reference.limitations ?? [])];
  const direct = reference.activationAllowed
    && reference.sourceRole === 'ACTIVATED_BENCHMARK'
    && sameVintage
    && actualOperation
    && limitations.length === 0;

  if (direct) {
    return {
      ...common,
      status: 'ASSESSED', rawReferencePosition: position, comparability: 'DIRECT_REFERENCE', semanticBlockers: [],
      reason: `Samma cost-vintage och ACTUAL_OPERATION mot aktiverad referens. Rå position ${position}. Detta lager beskriver position men sätter fortfarande inte Tier.`,
    };
  }

  const blockers: string[] = [];
  if (reference.sourceRole === 'RESEARCH_ONLY' || !reference.activationAllowed) blockers.push('referensen är diagnostic/reference-only i detta lager');
  blockers.push(...limitations);
  if (!actualOperation) blockers.push(`${args.costEvidenceClass} är ett tekniskt/annat estimat, inte actual operation`);
  if (!sameVintage) blockers.push(`cost vintage ${args.costBaseYear} skiljer sig från referensåret ${reference.dataYear}`);

  return {
    ...common,
    status: 'ASSESSED', rawReferencePosition: position, comparability: 'REFERENCE_ONLY', semanticBlockers: [],
    reason: `Rå referensposition ${position}. ${blockers.join('; ')}. Projektkostnaden rebases inte till referensåret; ingen syntetisk inflation/FX eller egen tolerans läggs på.`,
  };
}

/** S&P 2024 reference used for source-locked payable-Cu C1 diagnostics. */
export function buildSAndPCu2024CostPositionReference(): Tier1CostReference | null {
  const benchmark = TIER1_COST_BENCHMARKS.Cu;
  if (benchmark.q1Max === null || benchmark.p50Max === null || benchmark.p75Max === null) return null;
  return {
    id: 'S_AND_P_CO_PRODUCT_C1_CU_2024_DIAGNOSTIC',
    metric: benchmark.metric,
    dataYear: 2024,
    q1Max: benchmark.q1Max,
    p50Max: benchmark.p50Max,
    p75Max: benchmark.p75Max,
    unit: benchmark.unit,
    denominatorLabel: 'paid/payable Cu',
    sourceRole: 'RESEARCH_ONLY',
    activationAllowed: false,
    limitations: [
      'exact S&P 2024 allocation revenue/price vector is not public',
      'full current S&P C1 component boundary is not public',
      'S&P-compatible general vintage restatement method is not verified',
    ],
  };
}

/** Separate contained-Cu public research distribution. Not the S&P benchmark. */
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
    limitations: ['public curve is a separate contained-Cu research distribution, not the S&P paid/payable-Cu benchmark'],
  };
}
