import type {
  ManagementEvidence,
  ManagementRating,
  OptionalityEvidence,
  OptionalityRating,
} from './types.ts';

const MANAGEMENT_RANK: Record<Exclude<ManagementRating, 'unassessed'>, number> = {
  weak: 0,
  adequate: 1,
  strong: 2,
  exceptional: 3,
};

const OPTIONALITY_RANK: Record<Exclude<OptionalityRating, 'unassessed'>, number> = {
  none: 0,
  some: 1,
  strong: 2,
  exceptional: 3,
};

function managementValues(evidence: ManagementEvidence): Array<Exclude<ManagementRating, 'unassessed'>> | null {
  const values = [
    evidence.executionTrackRecord.rating,
    evidence.capitalAllocation.rating,
    evidence.deliveryCredibility.rating,
    evidence.technicalTeamFit.rating,
  ];
  if (values.some((rating) => rating === 'unassessed')) return null;
  return values as Array<Exclude<ManagementRating, 'unassessed'>>;
}

function optionalityValues(evidence: OptionalityEvidence): Array<Exclude<OptionalityRating, 'unassessed'>> | null {
  const values = [
    evidence.resourceExpansion.rating,
    evidence.minePlanConversion.rating,
    evidence.expansionDebottlenecking.rating,
    evidence.districtStrategic.rating,
  ];
  if (values.some((rating) => rating === 'unassessed')) return null;
  return values as Array<Exclude<OptionalityRating, 'unassessed'>>;
}

/**
 * Canonical management aggregate for Investment Score.
 *
 * Deliberately conservative: the arithmetic mean is floored so one strong
 * dimension cannot compensate for a weak one. Score-1 exact-fit execution is
 * still checked separately by the hard-gate engine.
 */
export function aggregateManagementRating(evidence: ManagementEvidence | null): ManagementRating | null {
  if (!evidence) return null;
  const values = managementValues(evidence);
  if (!values) return null;
  const average = values.reduce((sum, rating) => sum + MANAGEMENT_RANK[rating], 0) / values.length;
  const floored = Math.floor(average);
  if (floored >= 3) return 'exceptional';
  if (floored === 2) return 'strong';
  if (floored === 1) return 'adequate';
  return 'weak';
}

/** Score 1 requires directly relevant prior execution, not merely a high average. */
export function exactFitManagementPass(evidence: ManagementEvidence | null): boolean | null {
  if (!evidence || evidence.executionTrackRecord.rating === 'unassessed') return null;
  return evidence.executionTrackRecord.rating === 'exceptional';
}

/**
 * Canonical optionality aggregate used by the continuous positive-only bonus.
 * The aggregate remains conservative: four dimensions are averaged and floored.
 */
export function aggregateOptionalityRating(evidence: OptionalityEvidence | null): OptionalityRating | null {
  if (!evidence) return null;
  const values = optionalityValues(evidence);
  if (!values) return null;
  const average = values.reduce((sum, rating) => sum + OPTIONALITY_RANK[rating], 0) / values.length;
  const floored = Math.floor(average);
  if (floored >= 3) return 'exceptional';
  if (floored === 2) return 'strong';
  if (floored === 1) return 'some';
  return 'none';
}

/**
 * Hard-gate definition of broad exceptional optionality for the LOM exception.
 * A single exceptional dimension is not enough: at least three of the four
 * assessed optionality dimensions must themselves be exceptional. Missing
 * evidence stays unverified and can never qualify the gate.
 *
 * This is intentionally separate from aggregateOptionalityRating so the
 * continuous optionality bonus is unchanged by the hard-gate rule.
 */
export function exceptionalOptionalityForLongevityPass(evidence: OptionalityEvidence | null): boolean | null {
  if (!evidence) return null;
  const values = optionalityValues(evidence);
  if (!values) return null;
  return values.filter((rating) => rating === 'exceptional').length >= 3;
}
