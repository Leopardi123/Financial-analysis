import assert from 'node:assert/strict';
import {
  PUBLIC_CU_COST_BATCH2_OBSERVATIONS,
  TIER_PUBLIC_CU_COST_BATCH2_POLICY,
  buildExpandedPublicCuPilotCurve,
  normalizePublicCuBatch2Observation,
} from '../publicCuCostCurveBatch2.ts';

assert.equal(TIER_PUBLIC_CU_COST_BATCH2_POLICY.reportingPeriod, 'FULL_CALENDAR_YEAR');
assert.equal(TIER_PUBLIC_CU_COST_BATCH2_POLICY.operationBasis, 'FULL_OPERATION');
assert.equal(TIER_PUBLIC_CU_COST_BATCH2_POLICY.supplementalPriceDeck.Co.value, 11.26);
assert.match(TIER_PUBLIC_CU_COST_BATCH2_POLICY.supplementalPriceDeck.Co.sourceUrl, /hkexnews/);
assert.equal(PUBLIC_CU_COST_BATCH2_OBSERVATIONS.length, 10);
assert.equal(PUBLIC_CU_COST_BATCH2_OBSERVATIONS.filter((r) => r.status === 'ELIGIBLE_FOR_PILOT').length, 6);
assert.equal(PUBLIC_CU_COST_BATCH2_OBSERVATIONS.filter((r) => r.status === 'PARTIAL').length, 4);

const expected: Record<string, number> = {
  'centinela-2024': 2.114235966665641,
  'kounrad-2024': 0.8012711409926333,
  'las-bambas-2024': 1.6531976163511322,
  'kinsevere-2024': 2.919331451443189,
  'el-roble-2024': 2.413997933941953,
  'mvc-2024': 2.094805718796597,
};
for (const [id, value] of Object.entries(expected)) {
  const source = PUBLIC_CU_COST_BATCH2_OBSERVATIONS.find((r) => r.id === id);
  assert.ok(source);
  if (!source) continue;
  const row = normalizePublicCuBatch2Observation(source);
  assert.equal(row.status, 'NORMALIZED', id);
  if (row.status === 'NORMALIZED') assert.ok(Math.abs(row.normalizedCuCostUSDPerLbContainedCu - value) < 1e-12, id);
}

for (const source of PUBLIC_CU_COST_BATCH2_OBSERVATIONS.filter((r) => r.status === 'PARTIAL')) {
  assert.equal(normalizePublicCuBatch2Observation(source).status, 'NOT_VERIFIED');
}

const expanded = buildExpandedPublicCuPilotCurve();
assert.equal(expanded.reviewedObservationCount, 19);
assert.equal(expanded.eligibleObservationCount, 11);
assert.equal(expanded.partialObservationCount, 8);
assert.equal(expanded.status, 'NOT_READY');
assert.equal(expanded.comparisonEnabled, false);
assert.equal(expanded.minimumRequired, 20);
assert.equal(expanded.q1Max, null);
assert.equal(expanded.p50Max, null);
assert.equal(expanded.p75Max, null);
assert.ok(Math.abs(expanded.totalContainedCuTonnes - 1_604_667.63286418) < 1e-6);

const centinela = PUBLIC_CU_COST_BATCH2_OBSERVATIONS.find((r) => r.id === 'centinela-2024')!;
assert.equal(normalizePublicCuBatch2Observation({ ...centinela, id: 'wrong-year', dataYear: 2023 }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch2Observation({ ...centinela, id: 'partial-year', reportingPeriod: 'PARTIAL_YEAR' }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch2Observation({ ...centinela, id: 'attributable', operationBasis: 'ATTRIBUTABLE' }).status, 'NOT_VERIFIED');

console.log('publicCuCostCurveBatch2.test.ts passed');
