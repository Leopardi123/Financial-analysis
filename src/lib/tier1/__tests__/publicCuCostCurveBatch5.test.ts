import assert from 'node:assert/strict';
import {
  PUBLIC_CU_COST_BATCH5_OBSERVATIONS,
  TIER_PUBLIC_CU_COST_BATCH5_POLICY,
  buildBatch5PublicCuPilotCurve,
  normalizePublicCuBatch5Observation,
} from '../publicCuCostCurveBatch5.ts';

assert.equal(TIER_PUBLIC_CU_COST_BATCH5_POLICY.reportingPeriod, 'FULL_CALENDAR_YEAR');
assert.equal(TIER_PUBLIC_CU_COST_BATCH5_POLICY.operationBasis, 'FULL_OPERATION');
assert.equal(TIER_PUBLIC_CU_COST_BATCH5_POLICY.supplementalFx.AUD_USD_2024.value, 0.660);
assert.equal(TIER_PUBLIC_CU_COST_BATCH5_POLICY.supplementalFx.AUD_USD_2024.unit, 'USD_PER_AUD');
assert.match(TIER_PUBLIC_CU_COST_BATCH5_POLICY.supplementalFx.AUD_USD_2024.sourceUrl, /asxpdf/);

assert.equal(PUBLIC_CU_COST_BATCH5_OBSERVATIONS.length, 6);
assert.equal(PUBLIC_CU_COST_BATCH5_OBSERVATIONS.filter((row) => row.status === 'ELIGIBLE_FOR_PILOT').length, 2);
assert.equal(PUBLIC_CU_COST_BATCH5_OBSERVATIONS.filter((row) => row.status === 'PARTIAL').length, 4);

const expected: Record<string, number> = {
  'motheo-2024': 1.6541061242676238,
  'tritton-2024': 2.7847145630952577,
};

for (const [id, value] of Object.entries(expected)) {
  const source = PUBLIC_CU_COST_BATCH5_OBSERVATIONS.find((row) => row.id === id);
  assert.ok(source, `Missing batch-5 source ${id}`);
  if (!source) continue;
  const result = normalizePublicCuBatch5Observation(source);
  assert.equal(result.status, 'NORMALIZED', id);
  if (result.status === 'NORMALIZED') {
    assert.ok(Math.abs(result.normalizedCuCostUSDPerLbContainedCu - value) < 1e-12, `${id} normalized cost drifted`);
    assert.ok(result.copperReferenceValueShare > 0 && result.copperReferenceValueShare <= 1);
  }
}

for (const source of PUBLIC_CU_COST_BATCH5_OBSERVATIONS.filter((row) => row.status === 'PARTIAL')) {
  const result = normalizePublicCuBatch5Observation(source);
  assert.equal(result.status, 'NOT_VERIFIED', source.id);
  assert.ok(result.status === 'NOT_VERIFIED' && result.blockers.length > 0);
}

const expanded = buildBatch5PublicCuPilotCurve();
assert.equal(expanded.reviewedObservationCount, 38);
assert.equal(expanded.eligibleObservationCount, 22);
assert.equal(expanded.partialObservationCount, 16);
assert.equal(expanded.status, 'RESEARCH_CURVE_READY');
assert.equal(expanded.comparisonEnabled, false);
assert.equal(expanded.minimumRequired, 20);
assert.ok(Math.abs(expanded.totalContainedCuTonnes - 1_991_842.54577016) < 1e-6);
assert.ok(Math.abs((expanded.q1Max ?? 0) - 1.6531976163511322) < 1e-12);
assert.ok(Math.abs((expanded.p50Max ?? 0) - 1.931082177131546) < 1e-12);
assert.ok(Math.abs((expanded.p75Max ?? 0) - 2.114235966665641) < 1e-12);

assert.ok(expanded.diagnostics);
if (!expanded.diagnostics) throw new Error('Batch-5 diagnostics missing');
assert.equal(expanded.diagnostics.largestObservationId, 'kamoa-kakula-2024');
assert.ok(Math.abs(expanded.diagnostics.largestObservationWeightShare - 0.21942547664128104) < 1e-12);
assert.ok(Math.abs(expanded.diagnostics.top3WeightShare - 0.4975157309017281) < 1e-12);
assert.ok(Math.abs(expanded.diagnostics.top5WeightShare - 0.6956885236449293) < 1e-12);
assert.ok(Math.abs(expanded.diagnostics.top10WeightShare - 0.8619797803024324) < 1e-12);
assert.ok(Math.abs(expanded.diagnostics.mineWeightedQ1 - 1.7990708636817774) < 1e-12);
assert.ok(Math.abs(expanded.diagnostics.mineWeightedP50 - 2.094805718796597) < 1e-12);
assert.ok(Math.abs(expanded.diagnostics.mineWeightedP75 - 2.788145611361359) < 1e-12);
assert.ok(Math.abs((expanded.diagnostics.leaveLargestOutQ1 ?? 0) - 1.7397131835538981) < 1e-12);
assert.ok(Math.abs((expanded.diagnostics.leaveLargestOutP50 ?? 0) - 1.94) < 1e-12);
assert.ok(Math.abs((expanded.diagnostics.leaveLargestOutP75 ?? 0) - 2.114235966665641) < 1e-12);

const motheo = PUBLIC_CU_COST_BATCH5_OBSERVATIONS.find((row) => row.id === 'motheo-2024');
assert.ok(motheo);
if (!motheo) throw new Error('Motheo source missing');
assert.equal(normalizePublicCuBatch5Observation({ ...motheo, id: 'wrong-year', dataYear: 2023 }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch5Observation({ ...motheo, id: 'partial-year', reportingPeriod: 'PARTIAL_YEAR' }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch5Observation({ ...motheo, id: 'attributable', operationBasis: 'ATTRIBUTABLE' }).status, 'NOT_VERIFIED');

console.log('publicCuCostCurveBatch5.test.ts passed');
