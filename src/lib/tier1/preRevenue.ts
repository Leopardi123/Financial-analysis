// Active Tier pre-revenue policy wrapper.
//
// COST QUARTILE IS DISABLED / N/A from 2026-09-02.
// Read docs/TIER1_COST_QUARTILE_DISABLED_READ_BEFORE_REACTIVATION.md before
// attempting to reactivate it. The legacy implementation is preserved in
// preRevenueLegacySnapshot.ts for diagnostics/research only.

export * from './preRevenueLegacySnapshot.ts';

import {
  type Tier1Gate,
  type Tier1OverallStatus,
  type Tier1PreRevenueAssessment,
} from './preRevenueLegacySnapshot.ts';
import type { Tier1Metal, Tier1CostMetric } from './config.ts';

export const TIER1_COST_QUARTILE_INACTIVE_REASON =
  'N/A — Cost Quartile är avstängd som Tier-input. Kostnadsdata och externa referenser är endast diagnostik och påverkar inte Tier-resultatet. Se docs/TIER1_COST_QUARTILE_DISABLED_READ_BEFORE_REACTIVATION.md.';

/** Active policy: Cost Quartile is N/A; cycle resistance is a real Tier ceiling. */
export function classifyTier(gates: Tier1PreRevenueAssessment['gates']): {
  status: Tier1OverallStatus;
  reason: string;
} {
  if (gates.capitalReturns.status === 'FAIL' && gates.capitalReturns.tier === null) {
    return { status: 'NOT_QUALIFIED', reason: 'After-tax IRR ligger under miniminivån 15 %. Cost Quartile är N/A och räknas inte.' };
  }
  if (gates.cycle.status === 'FAIL' && gates.cycle.tier === null) {
    return { status: 'NOT_QUALIFIED', reason: 'Projektet klarar inte den 7-åriga survival-stressen med positiv NPV10. Cost Quartile är N/A och räknas inte.' };
  }

  const essential = [gates.lom, gates.scale, gates.capitalReturns, gates.cycle];
  if (essential.some((gate) => gate.status === 'NOT_VERIFIED' || gate.tier === null)) {
    return { status: 'NOT_VERIFIED', reason: 'En eller flera aktiva kategorier som kan ändra Tier eller kvalificering är inte verifierade. Cost Quartile är N/A och räknas inte.' };
  }

  const structuralTier = Math.max(
    gates.lom.tier as 1 | 2 | 3,
    gates.scale.tier as 1 | 2 | 3,
    gates.capitalReturns.tier as 1 | 2 | 3,
    gates.cycle.tier as 1 | 2 | 3,
  ) as 1 | 2 | 3;

  if (structuralTier === 1) {
    return {
      status: 'TIER_1',
      reason: 'Tier-1-kraven uppfylls för livslängd, fysisk produktionsskala, 5-årig normaliserad cykelresistens med 7-årig survival-gate och kapitalavkastning. Cost Quartile är N/A och påverkar inte klassningen.',
    };
  }

  const limiters: string[] = [];
  if (gates.lom.tier === structuralTier) limiters.push('LOM');
  if (gates.scale.tier === structuralTier) limiters.push('produktionsskala');
  if (gates.capitalReturns.tier === structuralTier) limiters.push('kapitalavkastning');
  if (gates.cycle.tier === structuralTier) limiters.push('cykelresistens');

  return {
    status: structuralTier === 2 ? 'TIER_2' : 'TIER_3',
    reason: `${limiters.length > 0 ? limiters.join(', ') : 'Minst en aktiv kategori'} sätter Tier-${structuralTier}-taket. Cost Quartile är N/A och påverkar inte klassningen.`,
  };
}

/**
 * Cost research remains available elsewhere, but the active Tier gate is N/A.
 * Do not turn a computable cost number into a Tier gate without first resolving
 * the comparability issues documented in the reactivation note.
 */
export function assessCost(_args: {
  primaryMetal: Tier1Metal | null;
  primaryMetalRevenueShare: number | null;
  costMetricValues: Partial<Record<Tier1CostMetric, number>>;
  nowUtc?: string;
}): Tier1Gate {
  return {
    status: 'NOT_VERIFIED',
    tier: null,
    value: null,
    threshold: null,
    unit: null,
    reason: TIER1_COST_QUARTILE_INACTIVE_REASON,
  };
}
