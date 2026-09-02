import assert from 'node:assert/strict';
import {
  assessCostPositionAgainstReference,
  buildPublicCu2024CostPositionReference,
  technicalReportCostEvidenceClass,
  TIER_PUBLIC_CU_COST_POSITION_METRIC,
  type Tier1CostReference,
} from '../costPosition.ts';

const publicCu2024 = buildPublicCu2024CostPositionReference();
assert.ok(publicCu2024);
if (!publicCu2024) throw new Error('Public Cu 2024 reference missing');
assert.equal(publicCu2024.sourceRole, 'RESEARCH_ONLY');
assert.equal(publicCu2024.activationAllowed, false);
assert.equal(publicCu2024.metric, TIER_PUBLIC_CU_COST_POSITION_METRIC);
assert.equal(publicCu2024.unit, 'USD/lb');
assert.equal(publicCu2024.denominatorLabel, 'contained Cu');
assert.ok(Math.abs(publicCu2024.q1Max - 1.6531976163511322) < 1e-12);
assert.ok(Math.abs(publicCu2024.p50Max - 1.9310821771315465) < 1e-12);
assert.ok(Math.abs(publicCu2024.p75Max - 2.114235966665641) < 1e-12);

assert.equal(technicalReportCostEvidenceClass('vizcachitas-pfs-2023'), 'PFS_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('berg-pfs-2026'), 'PFS_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('warintza-pfs-2025'), 'PFS_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('arctic-fs-2023'), 'FS_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('copper-creek-pea-2023'), 'PEA_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('unknown-source'), 'UNKNOWN');
assert.equal(technicalReportCostEvidenceClass(null), 'UNKNOWN');

// A Crean-Hill-like future PFS example on the exact public research metric.
// Preserve the 2026 project measurement; show only its raw relation to 2024.
const pfs2026 = assessCostPositionAgainstReference({
  measuredMetric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
  value: 1.58,
  unit: 'USD/lb',
  costBaseYear: 2026,
  costEvidenceClass: 'PFS_ESTIMATE',
  reference: publicCu2024,
});
assert.equal(pfs2026.status, 'ASSESSED');
assert.equal(pfs2026.measuredCost, 1.58);
assert.equal(pfs2026.adjustedCost, null);
assert.equal(pfs2026.adjustmentApplied, false);
assert.equal(pfs2026.hardTier, null);
assert.equal(pfs2026.rawReferencePosition, 'BELOW_Q1_REFERENCE');
assert.equal(pfs2026.comparability, 'REFERENCE_ONLY');
assert.ok(pfs2026.reason.includes('cost vintage 2026'));
assert.ok(pfs2026.reason.includes('ingen syntetisk inflation/FX'));

// Same vintage is still reference-only for an engineering estimate.
const pea2024 = assessCostPositionAgainstReference({
  measuredMetric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
  value: 1.20,
  unit: 'USD/lb',
  costBaseYear: 2024,
  costEvidenceClass: 'PEA_ESTIMATE',
  reference: publicCu2024,
});
assert.equal(pea2024.rawReferencePosition, 'BELOW_Q1_REFERENCE');
assert.equal(pea2024.comparability, 'REFERENCE_ONLY');
assert.equal(pea2024.hardTier, null);

// Similar-looking report C1 must not be placed on the contained-Cu public curve.
const reportDefinedC1 = assessCostPositionAgainstReference({
  measuredMetric: 'C1_CU_USD_PER_LB',
  value: 1.20,
  unit: 'USD/lb',
  costBaseYear: 2024,
  costEvidenceClass: 'PFS_ESTIMATE',
  reference: publicCu2024,
});
assert.equal(reportDefinedC1.comparability, 'NOT_COMPARABLE');
assert.equal(reportDefinedC1.rawReferencePosition, 'UNAVAILABLE');
assert.equal(reportDefinedC1.measuredCost, 1.20);
assert.equal(reportDefinedC1.adjustedCost, null);
assert.ok(reportDefinedC1.reason.includes('Metric mismatch'));

const wrongUnit = assessCostPositionAgainstReference({
  measuredMetric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
  value: 1.20,
  unit: 'USD/tonne',
  costBaseYear: 2024,
  costEvidenceClass: 'ACTUAL_OPERATION',
  reference: publicCu2024,
});
assert.equal(wrongUnit.comparability, 'NOT_COMPARABLE');
assert.equal(wrongUnit.rawReferencePosition, 'UNAVAILABLE');
assert.ok(wrongUnit.reason.includes('Unit mismatch'));

// Even an actual 2024 operation cannot turn the public curve into a Tier gate.
const actual2024ResearchOnly = assessCostPositionAgainstReference({
  measuredMetric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
  value: 1.20,
  unit: 'USD/lb',
  costBaseYear: 2024,
  costEvidenceClass: 'ACTUAL_OPERATION',
  reference: publicCu2024,
});
assert.equal(actual2024ResearchOnly.comparability, 'REFERENCE_ONLY');
assert.equal(actual2024ResearchOnly.hardTier, null);

const activatedReference: Tier1CostReference = {
  ...publicCu2024,
  id: 'TEST_ACTIVATED_REFERENCE',
  sourceRole: 'ACTIVATED_BENCHMARK',
  activationAllowed: true,
};
const directActual = assessCostPositionAgainstReference({
  measuredMetric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
  value: 1.80,
  unit: 'USD/lb',
  costBaseYear: 2024,
  costEvidenceClass: 'ACTUAL_OPERATION',
  reference: activatedReference,
});
assert.equal(directActual.comparability, 'DIRECT_REFERENCE');
assert.equal(directActual.rawReferencePosition, 'Q1_TO_P50_REFERENCE');
assert.equal(directActual.hardTier, null);

const vintageMismatch = assessCostPositionAgainstReference({
  measuredMetric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
  value: 2.00,
  unit: 'USD/lb',
  costBaseYear: 2023,
  costEvidenceClass: 'ACTUAL_OPERATION',
  reference: activatedReference,
});
assert.equal(vintageMismatch.comparability, 'REFERENCE_ONLY');
assert.equal(vintageMismatch.rawReferencePosition, 'P50_TO_Q3_REFERENCE');
assert.equal(vintageMismatch.adjustedCost, null);

const missingVintage = assessCostPositionAgainstReference({
  measuredMetric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
  value: 2.30,
  unit: 'USD/lb',
  costBaseYear: null,
  costEvidenceClass: 'PFS_ESTIMATE',
  reference: publicCu2024,
});
assert.equal(missingVintage.comparability, 'NOT_COMPARABLE');
assert.equal(missingVintage.rawReferencePosition, 'ABOVE_Q3_REFERENCE');
assert.equal(missingVintage.hardTier, null);

const unknownEvidence = assessCostPositionAgainstReference({
  measuredMetric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
  value: 1.50,
  unit: 'USD/lb',
  costBaseYear: 2024,
  costEvidenceClass: 'UNKNOWN',
  reference: publicCu2024,
});
assert.equal(unknownEvidence.comparability, 'NOT_COMPARABLE');
assert.equal(unknownEvidence.rawReferencePosition, 'BELOW_Q1_REFERENCE');
assert.equal(unknownEvidence.hardTier, null);

console.log('costPosition.test.ts passed');
