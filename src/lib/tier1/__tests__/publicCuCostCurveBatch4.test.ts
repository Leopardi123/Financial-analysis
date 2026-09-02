import './publicCuCostCurveBatch3.test.ts';
import './publicCuCostCurveBatch5.test.ts';
import assert from 'node:assert/strict';
import {
  PUBLIC_CU_COST_BATCH4_OBSERVATIONS,
  TIER_PUBLIC_CU_COST_BATCH4_POLICY,
  buildBatch4PublicCuPilotCurve,
  normalizePublicCuBatch4Observation,
} from '../publicCuCostCurveBatch4.ts';

assert.equal(TIER_PUBLIC_CU_COST_BATCH4_POLICY.reportingPeriod, 'FULL_CALENDAR_YEAR');
assert.equal(TIER_PUBLIC_CU_COST_BATCH4_POLICY.operationBasis, 'FULL_OPERATION');
assert.equal(TIER_PUBLIC_CU_COST_BATCH4_POLICY.supplementalPriceDeck.Zn.value, 2_779.02);
assert.equal(TIER_PUBLIC_CU_COST_BATCH4_POLICY.supplementalPriceDeck.Pb.value, 2_072);
assert.equal(TIER_PUBLIC_CU_COST_BATCH4_POLICY.supplementalPriceDeck.Pb.unit, 'USD_PER_TONNE');
assert.match(TIER_PUBLIC_CU_COST_BATCH4_POLICY.supplementalPriceDeck.Pb.sourceUrl, /asxpdf/);

assert.equal(PUBLIC_CU_COST_BATCH4_OBSERVATIONS.length, 5);
assert.equal(PUBLIC_CU_COST_BATCH4_OBSERVATIONS.filter((row) => row.status === 'ELIGIBLE_FOR_PILOT').length, 5);

const expected: Record<string, number> = {
  'csa-copper-2024': 2.0352025584729643,
  'bolivar-2024': 2.3371388213252393,
  'golden-grove-2024': 2.998272129065656,
  'new-afton-2024': 1.8787426696443268,
  'zaldivar-2024': 3.02,
};

for (const [id, value] of Object.entries(expected)) {
  const source = PUBLIC_CU_COST_BATCH4_OBSERVATIONS.find((row) => row.id === id);
  assert.ok(source, `Missing batch-4 source ${id}`);
  if (!source) continue;
  const result = normalizePublicCuBatch4Observation(source);
  assert.equal(result.status, 'NORMALIZED', id);
  if (result.status === 'NORMALIZED') {
    assert.ok(Math.abs(result.normalizedCuCostUSDPerLbContainedCu - value) < 1e-12, `${id} normalized cost drifted`);
    assert.ok(result.copperReferenceValueShare > 0 && result.copperReferenceValueShare <= 1);
  }
}

const expanded = buildBatch4PublicCuPilotCurve();
assert.equal(expanded.reviewedObservationCount, 32);
assert.equal(expanded.eligibleObservationCount, 20);
assert.equal(expanded.partialObservationCount, 12);
assert.equal(expanded.status, 'RESEARCH_CURVE_READY');
assert.equal(expanded.comparisonEnabled, false);
assert.equal(expanded.minimumRequired, 20);
assert.ok(Math.abs(expanded.totalContainedCuTonnes - 1_923_521.54577016) < 1e-6);
assert.ok(Math.abs((expanded.q1Max ?? 0) - 1.6531976163511322) < 1e-12);
assert.ok(Math.abs((expanded.p50Max ?? 0) - 1.931082177131546) < 1e-12);
assert.ok(Math.abs((expanded.p75Max ?? 0) - 2.114235966665641) < 1e-12);
assert.ok(!expanded.failures.some((row) => row.id === 'new-afton-2024'));
assert.ok(!expanded.failures.some((row) => row.id === 'zaldivar-2024'));

const csa = PUBLIC_CU_COST_BATCH4_OBSERVATIONS.find((row) => row.id === 'csa-copper-2024');
assert.ok(csa);
if (!csa) throw new Error('CSA source missing');
assert.equal(normalizePublicCuBatch4Observation({ ...csa, id: 'wrong-year', dataYear: 2023 }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch4Observation({ ...csa, id: 'partial-year', reportingPeriod: 'PARTIAL_YEAR' }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch4Observation({ ...csa, id: 'attributable', operationBasis: 'ATTRIBUTABLE' }).status, 'NOT_VERIFIED');

console.log('publicCuCostCurveBatch4.test.ts passed');
