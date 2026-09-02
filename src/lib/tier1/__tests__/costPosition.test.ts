import assert from 'node:assert/strict';
import {
  assessCostPositionAgainstReference,
  buildPublicCu2024CostPositionReference,
  type Tier1CostReference,
} from '../costPosition.ts';

const publicCu2024 = buildPublicCu2024CostPositionReference();
assert.ok(publicCu2024);
if (!publicCu2024) throw new Error('Public Cu 2024 reference missing');
assert.equal(publicCu2024.sourceRole, 'RESEARCH_ONLY');
assert.equal(publicCu2024.activationAllowed, false);
assert.ok(Math.abs(publicCu2024.q1Max - 1.6531976163511322) < 1e-12);
assert.ok(Math.abs(publicCu2024.p50Max - 1.9310821771315465) < 1e-12);
assert.ok(Math.abs(publicCu2024.p75Max - 2.114235966665641) < 1e-12);

// Crean-Hill-like example: preserve the 2026 PFS measurement exactly. The raw
// relation to the 2024 curve may be shown, but the project is not rebased to a
// synthetic 2024 cost and no Tier is assigned.
const pfs2026 = assessCostPositionAgainstReference({
  value: 1.58,
  unit: 'USD/lb contained Cu',
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

// Same vintage is still reference-only when the project number is a technical
// study estimate rather than an actual operating observation.
const pea2024 = assessCostPositionAgainstReference({
  value: 1.20,
  unit: 'USD/lb contained Cu',
  costBaseYear: 2024,
  costEvidenceClass: 'PEA_ESTIMATE',
  reference: publicCu2024,
});
assert.equal(pea2024.rawReferencePosition, 'BELOW_Q1_REFERENCE');
assert.equal(pea2024.comparability, 'REFERENCE_ONLY');
assert.equal(pea2024.hardTier, null);

// Even an actual 2024 operation cannot turn the public curve into a Tier gate:
// activationAllowed=false is a hard policy property of the reference itself.
const actual2024ResearchOnly = assessCostPositionAgainstReference({
  value: 1.20,
  unit: 'USD/lb contained Cu',
  costBaseYear: 2024,
  costEvidenceClass: 'ACTUAL_OPERATION',
  reference: publicCu2024,
});
assert.equal(actual2024ResearchOnly.comparability, 'REFERENCE_ONLY');
assert.equal(actual2024ResearchOnly.hardTier, null);

// DIRECT_REFERENCE exists only as a future-capability state. It requires an
// explicitly activated reference, same vintage and ACTUAL_OPERATION. It still
// does not set Tier; a separate policy decision would be required.
const activatedReference: Tier1CostReference = {
  ...publicCu2024,
  id: 'TEST_ACTIVATED_REFERENCE',
  sourceRole: 'ACTIVATED_BENCHMARK',
  activationAllowed: true,
};
const directActual = assessCostPositionAgainstReference({
  value: 1.80,
  unit: 'USD/lb contained Cu',
  costBaseYear: 2024,
  costEvidenceClass: 'ACTUAL_OPERATION',
  reference: activatedReference,
});
assert.equal(directActual.comparability, 'DIRECT_REFERENCE');
assert.equal(directActual.rawReferencePosition, 'Q1_TO_P50_REFERENCE');
assert.equal(directActual.hardTier, null);

const vintageMismatch = assessCostPositionAgainstReference({
  value: 2.00,
  unit: 'USD/lb contained Cu',
  costBaseYear: 2023,
  costEvidenceClass: 'ACTUAL_OPERATION',
  reference: activatedReference,
});
assert.equal(vintageMismatch.comparability, 'REFERENCE_ONLY');
assert.equal(vintageMismatch.rawReferencePosition, 'P50_TO_Q3_REFERENCE');
assert.equal(vintageMismatch.adjustedCost, null);

const missingVintage = assessCostPositionAgainstReference({
  value: 2.30,
  unit: 'USD/lb contained Cu',
  costBaseYear: null,
  costEvidenceClass: 'PFS_ESTIMATE',
  reference: publicCu2024,
});
assert.equal(missingVintage.comparability, 'NOT_COMPARABLE');
assert.equal(missingVintage.rawReferencePosition, 'ABOVE_Q3_REFERENCE');
assert.equal(missingVintage.hardTier, null);

const unknownEvidence = assessCostPositionAgainstReference({
  value: 1.50,
  unit: 'USD/lb contained Cu',
  costBaseYear: 2024,
  costEvidenceClass: 'UNKNOWN',
  reference: publicCu2024,
});
assert.equal(unknownEvidence.comparability, 'NOT_COMPARABLE');
assert.equal(unknownEvidence.rawReferencePosition, 'BELOW_Q1_REFERENCE');
assert.equal(unknownEvidence.hardTier, null);

console.log('costPosition.test.ts passed');
