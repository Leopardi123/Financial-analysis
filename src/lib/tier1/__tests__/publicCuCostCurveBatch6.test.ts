import './publicCuCostCurveBatch5.test.ts';
import assert from 'node:assert/strict';
import {
  PUBLIC_CU_COST_BATCH6_OBSERVATIONS,
  TIER_PUBLIC_CU_COST_BATCH6_POLICY,
  buildBatch6PublicCuPilotCurve,
  normalizePublicCuBatch6Observation,
} from '../publicCuCostCurveBatch6.ts';
import { PUBLIC_CU_COST_LB_PER_TONNE } from '../publicCuCostCurve.ts';

assert.equal(TIER_PUBLIC_CU_COST_BATCH6_POLICY.reportingPeriod, 'FULL_CALENDAR_YEAR');
assert.equal(TIER_PUBLIC_CU_COST_BATCH6_POLICY.operationBasis, 'FULL_OPERATION');
assert.equal(PUBLIC_CU_COST_BATCH6_OBSERVATIONS.length, 4);
assert.equal(PUBLIC_CU_COST_BATCH6_OBSERVATIONS.filter((row) => row.status === 'ELIGIBLE_FOR_PILOT').length, 1);
assert.equal(PUBLIC_CU_COST_BATCH6_OBSERVATIONS.filter((row) => row.status === 'PARTIAL').length, 3);

const mountMilligan = PUBLIC_CU_COST_BATCH6_OBSERVATIONS.find((row) => row.id === 'mount-milligan-2024');
assert.ok(mountMilligan);
if (!mountMilligan) throw new Error('Mount Milligan source missing');
const normalizedMountMilligan = normalizePublicCuBatch6Observation(mountMilligan);
assert.equal(normalizedMountMilligan.status, 'NORMALIZED');
if (normalizedMountMilligan.status === 'NORMALIZED') {
  assert.ok(Math.abs(normalizedMountMilligan.normalizedCuCostUSDPerLbContainedCu - 2.0263188755887858) < 1e-12);
  assert.ok(Math.abs(normalizedMountMilligan.copperContainedTonnes - (57_600_000 / PUBLIC_CU_COST_LB_PER_TONNE)) < 1e-9);
  assert.equal(normalizedMountMilligan.commonPoolUSD, 316_500_000);
  assert.ok(normalizedMountMilligan.copperReferenceValueShare > 0 && normalizedMountMilligan.copperReferenceValueShare < 1);
}

for (const source of PUBLIC_CU_COST_BATCH6_OBSERVATIONS.filter((row) => row.status === 'PARTIAL')) {
  const result = normalizePublicCuBatch6Observation(source);
  assert.equal(result.status, 'NOT_VERIFIED', source.id);
  assert.ok(result.status === 'NOT_VERIFIED' && result.blockers.length > 0);
}

const expanded = buildBatch6PublicCuPilotCurve();
assert.equal(expanded.reviewedObservationCount, 41);
assert.equal(expanded.eligibleObservationCount, 23);
assert.equal(expanded.partialObservationCount, 18);
assert.equal(expanded.status, 'RESEARCH_CURVE_READY');
assert.equal(expanded.comparisonEnabled, false);
assert.equal(expanded.minimumRequired, 20);
assert.ok(Math.abs(expanded.totalContainedCuTonnes - 2_017_969.4662821596) < 1e-6);
assert.ok(expanded.q1Max !== null && expanded.p50Max !== null && expanded.p75Max !== null);
assert.ok((expanded.q1Max ?? Infinity) <= (expanded.p50Max ?? -Infinity));
assert.ok((expanded.p50Max ?? Infinity) <= (expanded.p75Max ?? -Infinity));
assert.ok(!expanded.failures.some((row) => row.id === 'mount-milligan-2024'));

assert.ok(expanded.diagnostics);
if (!expanded.diagnostics) throw new Error('Batch-6 diagnostics missing');
assert.equal(expanded.diagnostics.largestObservationId, 'kamoa-kakula-2024');
assert.ok(Math.abs(expanded.diagnostics.largestObservationWeightShare - 0.21658454565480953) < 1e-12);
assert.ok(Math.abs(expanded.diagnostics.top3WeightShare - 0.49107432820861063) < 1e-12);
assert.ok(Math.abs(expanded.diagnostics.top5WeightShare - 0.6866813513055634) < 1e-12);
assert.ok(Math.abs(expanded.diagnostics.top10WeightShare - 0.8508196128275477) < 1e-12);

assert.equal(normalizePublicCuBatch6Observation({ ...mountMilligan, id: 'wrong-year', dataYear: 2023 }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch6Observation({ ...mountMilligan, id: 'partial-year', reportingPeriod: 'PARTIAL_YEAR' }).status, 'NOT_VERIFIED');
assert.equal(normalizePublicCuBatch6Observation({ ...mountMilligan, id: 'attributable', operationBasis: 'ATTRIBUTABLE' }).status, 'NOT_VERIFIED');

console.log(
  `BATCH6_DIAGNOSTICS | q1=${expanded.q1Max} p50=${expanded.p50Max} p75=${expanded.p75Max}` +
  ` | mine=${expanded.diagnostics.mineWeightedQ1}/${expanded.diagnostics.mineWeightedP50}/${expanded.diagnostics.mineWeightedP75}` +
  ` | leaveLargest=${expanded.diagnostics.leaveLargestOutQ1}/${expanded.diagnostics.leaveLargestOutP50}/${expanded.diagnostics.leaveLargestOutP75}`,
);
console.log('publicCuCostCurveBatch6.test.ts passed');
