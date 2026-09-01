import './scale.test.ts';
import './costAllocation.test.ts';
import './costDefinitionContract.test.ts';
import './vizcachitasCostBridge.test.ts';
import assert from 'node:assert/strict';
import {
  TIER1_COST_BENCHMARKS,
  TIER1_COST_BENCHMARK_SNAPSHOTS,
  TIER1_PRODUCTION_THRESHOLDS,
  costBenchmarkDataYear,
  getCompatibleTier1CostBenchmark,
} from '../config.ts';

assert.deepEqual(
  Object.fromEntries(Object.entries(TIER1_PRODUCTION_THRESHOLDS).map(([metal, row]) => [metal, [row.minimumAnnualPayable, row.unit]])),
  {
    Au: [300_000, 'toz'], Ag: [15_000_000, 'toz'], Cu: [100_000, 'tonne'], Zn: [150_000, 'tonne'],
    Pb: [100_000, 'tonne'], Ni: [40_000, 'tonne'], Pt: [100_000, 'toz'], Pd: [150_000, 'toz'],
  },
);

assert.equal(TIER1_COST_BENCHMARKS.Au.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Au.basisId, 'S_AND_P_CO_PRODUCT_AISC_AU');
assert.equal(TIER1_COST_BENCHMARKS.Au.benchmarkKind, 'FULL_QUARTILE_CURVE');
assert.equal(TIER1_COST_BENCHMARKS.Au.q1Max, 1_228);
assert.equal(TIER1_COST_BENCHMARKS.Au.p50Max, 1_501);
assert.equal(TIER1_COST_BENCHMARKS.Au.p75Max, 1_840);
assert.equal(TIER1_COST_BENCHMARKS.Au.boundaryUncertaintyAbs, 0);
assert.equal(TIER1_COST_BENCHMARKS.Au.sourcePageOrTable, 'slide 27');
assert.ok(TIER1_COST_BENCHMARKS.Au.notes.includes('Q2 1 228–1 501'));
assert.ok(TIER1_COST_BENCHMARKS.Au.notes.includes('Q3 1 501–1 840'));

assert.equal(TIER1_COST_BENCHMARKS.Cu.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Cu.basisId, 'S_AND_P_CO_PRODUCT_C1_CU');
assert.equal(TIER1_COST_BENCHMARKS.Cu.benchmarkKind, 'FULL_QUARTILE_CURVE');
assert.equal(TIER1_COST_BENCHMARKS.Cu.q1Max, 1.4);
assert.equal(TIER1_COST_BENCHMARKS.Cu.p50Max, 1.76);
assert.equal(TIER1_COST_BENCHMARKS.Cu.p75Max, 2.18);
assert.equal(TIER1_COST_BENCHMARKS.Cu.boundaryUncertaintyAbs, 0.05);
assert.equal(TIER1_COST_BENCHMARKS.Cu.sourcePageOrTable, 'slide 10');
assert.ok(TIER1_COST_BENCHMARKS.Cu.notes.includes('digitaliserade'));

assert.equal(TIER1_COST_BENCHMARKS.Ag.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Ag.benchmarkKind, 'FULL_QUARTILE_CURVE');
assert.ok(TIER1_COST_BENCHMARKS.Ag.notes.includes('AISC silver'));
assert.ok(TIER1_COST_BENCHMARKS.Ag.notes.includes('co-product'));

assert.equal(TIER1_COST_BENCHMARKS.Zn.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Zn.benchmarkKind, 'INCOMPLETE_EXTERNAL_REFERENCE');
assert.ok(TIER1_COST_BENCHMARKS.Zn.notes.includes('Wood Mackenzie'));
assert.ok(TIER1_COST_BENCHMARKS.Zn.notes.includes('intervallet'));

assert.equal(TIER1_COST_BENCHMARKS.Pb.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Pb.benchmarkKind, 'NO_VERIFIED_CURVE');
assert.equal(TIER1_COST_BENCHMARKS.Pb.metric, null);

assert.equal(TIER1_COST_BENCHMARKS.Pt.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Pd.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Pt.benchmarkKind, 'NO_VERIFIED_CURVE');
assert.equal(TIER1_COST_BENCHMARKS.Pd.benchmarkKind, 'NO_VERIFIED_CURVE');

assert.equal(costBenchmarkDataYear(TIER1_COST_BENCHMARKS.Au), 2025);
assert.equal(costBenchmarkDataYear(TIER1_COST_BENCHMARKS.Cu), 2024);
assert.equal(costBenchmarkDataYear(TIER1_COST_BENCHMARKS.Ni), 2026);

const cu2024 = getCompatibleTier1CostBenchmark('Cu', 'C1_CU_USD_PER_LB', new Date('2026-01-01T00:00:00Z'));
assert.equal(cu2024.benchmark?.basisId, 'S_AND_P_CO_PRODUCT_C1_CU');
assert.equal(cu2024.mismatchReason, null);

const cuWrongMetric = getCompatibleTier1CostBenchmark('Cu', 'AISC_AU_USD_PER_TOZ', new Date('2026-01-01T00:00:00Z'));
assert.equal(cuWrongMetric.benchmark, null);
assert.ok(cuWrongMetric.mismatchReason?.includes('metric mismatch'));

const pbMissing = getCompatibleTier1CostBenchmark('Pb', null, new Date('2026-01-01T00:00:00Z'));
assert.equal(pbMissing.benchmark, null);
assert.ok(pbMissing.mismatchReason?.includes('No verified'));

assert.ok(TIER1_COST_BENCHMARK_SNAPSHOTS.length >= 4);
assert.ok(TIER1_COST_BENCHMARK_SNAPSHOTS.some((row) => row.metal === 'Au' && row.dataYear === 2025));
assert.ok(TIER1_COST_BENCHMARK_SNAPSHOTS.some((row) => row.metal === 'Cu' && row.dataYear === 2024));
assert.ok(TIER1_COST_BENCHMARK_SNAPSHOTS.some((row) => row.metal === 'Ni' && row.dataYear === 2026));

console.log('costBenchmarkBasis.test.ts passed');
