import './publicCuCostCurveBatch2.test.ts';
import assert from 'node:assert/strict';
import {
  PUBLIC_CU_COST_BATCH3_OBSERVATIONS,
  TIER_PUBLIC_CU_COST_BATCH3_POLICY,
  buildBatch3PublicCuPilotCurve,
  normalizePublicCuBatch3Observation,
} from '../publicCuCostCurveBatch3.ts';

assert.equal(TIER_PUBLIC_CU_COST_BATCH3_POLICY.reportingPeriod, 'FULL_CALENDAR_YEAR');
assert.equal(TIER_PUBLIC_CU_COST_BATCH3_POLICY.operationBasis, 'FULL_OPERATION');
assert.equal(TIER_PUBLIC_CU_COST_BATCH3_POLICY.supplementalPriceDeck.Zn.value, 2_779.02);
assert.equal(TIER_PUBLIC_CU_COST_BATCH3_POLICY.supplementalPriceDeck.Zn.unit, 'USD_PER_TONNE');
assert.match(TIER_PUBLIC_CU_COST_BATCH3_POLICY.supplementalPriceDeck.Zn.sourceUrl, /sec\.gov/);

assert.equal(PUBLIC_CU_COST_BATCH3_OBSERVATIONS.length, 10);
assert.equal(PUBLIC_CU_COST_BATCH3_OBSERVATIONS.filter((row) => row.status === 'ELIGIBLE_FOR_PILOT').length, 4);
assert.equal(PUBLIC_CU_COST_BATCH3_OBSERVATIONS.filter((row) => row.status === 'PARTIAL').length, 6);

const expected: Record<string, number> = {
  'mantos-blancos-2024': 2.788145611361359,
  'mantoverde-2024': 2.900981216176359,
  'cozamin-2024': 1.7397131835538981,
  'cayeli-2024': 2.104130150944324,
};

for (const [id, value] of Object.entries(expected)) {
  const source = PUBLIC_CU_COST_BATCH3_OBSERVATIONS.find((row) => row.id === id);
  assert.ok(source, `Missing batch-3 source ${id}`);
  if (!source) continue;
  const result = normalizePublicCuBatch3Observation(source);
  assert.equal(result.status, 'NORMALIZED', id);
  if (result.status === 'NORMALIZED') {
    assert.ok(Math.abs(result.normalizedCuCostUSDPerLbContainedCu - value) < 1e-12, `${id} normalized cost drifted`);
    assert.ok(result.copperReferenceValueShare > 0 && result.copperReferenceValueShare <= 1);
  }
}

for (const source of PUBLIC_CU_COST_BATCH3_OBSERVATIONS.filter((row) => row.status === 'PARTIAL')) {
  const result = normalizePublicCuBatch3Observation(source);
  assert.equal(result.status, 'NOT_VERIFIED', source.id);
  assert.ok(result.status === 'NOT_VERIFIED' && result.blockers.length > 0);
}

const expanded = buildBatch3PublicCuPilotCurve();
assert.equal(expanded.reviewedObservationCount, 29);
assert.equal(expanded.eligibleObservationCount, 15);
assert.equal(expanded.partialObservationCount, 14);
assert.equal(expanded.status, 'NOT_READY');
assert.equal(expanded.comparisonEnabled, false);
assert.equal(expanded.minimumRequired, 20);
assert.equal(expanded.q1Max, null);
assert.equal(expanded.p50Max, null);
assert.equal(expanded.p75Max, null);
assert.ok(Math.abs(expanded.totalContainedCuTonnes - 1_743_346.63286418) < 1e-6);

const mantos = PUBLIC_CU_COST_BATCH3_OBSERVATIONS.find((row) => row.id === 'mantos-blancos-2024');
assert.ok(mantos);
if (!mantos) throw new Error('Mantos Blancos source missing');
assert.equal(normalizePublicCuBatch3Observation({ ...mantos, id: 'wrong-year', dataYear: 2023 }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch3Observation({ ...mantos, id: 'partial-year', reportingPeriod: 'PARTIAL_YEAR' }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch3Observation({ ...mantos, id: 'attributable', operationBasis: 'ATTRIBUTABLE' }).status, 'NOT_VERIFIED');

const mountMilligan = PUBLIC_CU_COST_BATCH3_OBSERVATIONS.find((row) => row.id === 'mount-milligan-2024');
assert.ok(mountMilligan?.blockers?.some((item) => item.includes('PAYABLE_CU_PRODUCED')));

console.log('publicCuCostCurveBatch3.test.ts passed');
