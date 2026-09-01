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

// Silver now uses the verified public 2025 S&P-modelled co-product curve from
// Pan American. Percentiles are explicit best-estimate visual read-offs, with
// read-off uncertainty retained as diagnostic context rather than a hard guard.
assert.equal(TIER1_COST_BENCHMARKS.Ag.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Ag.metric, 'AISC_AG_CO_PRODUCT_USD_PER_TOZ');
assert.equal(TIER1_COST_BENCHMARKS.Ag.basisId, 'S_AND_P_CO_PRODUCT_AISC_AG');
assert.equal(TIER1_COST_BENCHMARKS.Ag.benchmarkKind, 'FULL_QUARTILE_CURVE');
assert.equal(TIER1_COST_BENCHMARKS.Ag.q1Max, 14.0);
assert.equal(TIER1_COST_BENCHMARKS.Ag.p50Max, 18.5);
assert.equal(TIER1_COST_BENCHMARKS.Ag.p75Max, 22.5);
assert.equal(TIER1_COST_BENCHMARKS.Ag.boundaryUncertaintyAbs, 0.75);
assert.equal(costBenchmarkDataYear(TIER1_COST_BENCHMARKS.Ag.dataPeriod), 2025);
assert.equal(TIER1_COST_BENCHMARKS.Ag.sourcePageOrTable, 'slide 16, 2025 Cost Curve (100%-basis)');
assert.ok(TIER1_COST_BENCHMARKS.Ag.notes.includes('visual read-offs'));

assert.equal(TIER1_COST_BENCHMARKS.Cu.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Cu.basisId, 'S_AND_P_CO_PRODUCT_C1_CU');
assert.equal(TIER1_COST_BENCHMARKS.Cu.benchmarkKind, 'FULL_QUARTILE_CURVE');
assert.equal(TIER1_COST_BENCHMARKS.Cu.q1Max, 1.40);
assert.equal(TIER1_COST_BENCHMARKS.Cu.p50Max, 1.76);
assert.equal(TIER1_COST_BENCHMARKS.Cu.p75Max, 2.18);
assert.equal(TIER1_COST_BENCHMARKS.Cu.boundaryUncertaintyAbs, 0.05);
assert.equal(costBenchmarkDataYear(TIER1_COST_BENCHMARKS.Cu.dataPeriod), 2024);
assert.equal(TIER1_COST_BENCHMARKS.Cu.sourcePageOrTable, 'slide 10, First Quartile Unit Cash Costs');
assert.ok(TIER1_COST_BENCHMARKS.Cu.notes.includes('digitised'));
assert.ok(TIER1_COST_BENCHMARKS.Cu.notes.includes('Santa Cruz C1 1.32'));

assert.equal(TIER1_COST_BENCHMARKS.Zn.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Pb.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Zn.basisId, 'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS');

assert.equal(TIER1_COST_BENCHMARKS.Ni.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Ni.basisId, 'JAGUAR_NI_C1_MINE_SITE_GA');
assert.equal(TIER1_COST_BENCHMARKS.Ni.q1Max, 3.34);
assert.equal(TIER1_COST_BENCHMARKS.Ni.p50Max, null);
assert.ok(TIER1_COST_BENCHMARKS.Ni.notes.includes('payable Ni basis'));
assert.ok(TIER1_COST_BENCHMARKS.Ni.notes.includes('by-product/co-product'));

assert.equal(TIER1_COST_BENCHMARKS.Pt.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Pd.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Pt.basisId, 'VALTERRA_PGM_3E_AISC_SOLD');
assert.equal(TIER1_COST_BENCHMARKS.Pd.basisId, 'VALTERRA_PGM_3E_AISC_SOLD');
assert.equal(TIER1_COST_BENCHMARKS.Pt.q1Max, 835);
assert.equal(TIER1_COST_BENCHMARKS.Pt.p50Max, null);
assert.ok(TIER1_COST_BENCHMARKS.Pt.notes.includes('första kvartilen'));
assert.ok(TIER1_COST_BENCHMARKS.Pt.evidenceUrl?.includes('integrated-report-2025.pdf'));

for (const benchmark of Object.values(TIER1_COST_BENCHMARKS)) {
  assert.ok(benchmark.boundaryUncertaintyAbs >= 0);
  if (benchmark.benchmarkKind === 'FULL_QUARTILE_CURVE') {
    assert.ok(typeof benchmark.q1Max === 'number');
    assert.ok(typeof benchmark.p50Max === 'number');
    assert.ok(typeof benchmark.p75Max === 'number');
    assert.ok(benchmark.q1Max < benchmark.p50Max);
    assert.ok(benchmark.p50Max < benchmark.p75Max);
  }
  if (benchmark.benchmarkKind === 'CURVE_IDENTIFIED_NO_BOUNDARIES') {
    assert.equal(benchmark.comparisonEnabled, false);
    assert.equal(benchmark.q1Max, null);
    assert.equal(benchmark.p50Max, null);
    assert.equal(benchmark.p75Max, null);
  }
}

assert.equal(costBenchmarkDataYear(TIER1_COST_BENCHMARKS.Au.dataPeriod), 2025);
assert.equal(TIER1_COST_BENCHMARK_SNAPSHOTS.Au.length, 1);
assert.equal(getCompatibleTier1CostBenchmark({ metal: 'Au', metric: 'AISC_AU_USD_PER_TOZ', basisId: 'S_AND_P_CO_PRODUCT_AISC_AU', costBaseYear: 2025 }), TIER1_COST_BENCHMARKS.Au);
assert.equal(getCompatibleTier1CostBenchmark({ metal: 'Au', metric: 'AISC_AU_USD_PER_TOZ', basisId: 'S_AND_P_CO_PRODUCT_AISC_AU', costBaseYear: 2024 }), null);
assert.equal(getCompatibleTier1CostBenchmark({ metal: 'Au', metric: 'AISC_AU_USD_PER_TOZ', basisId: 'JAGUAR_NI_C1_MINE_SITE_GA', costBaseYear: 2025 }), null);

assert.equal(TIER1_COST_BENCHMARK_SNAPSHOTS.Ag.length, 1);
assert.equal(getCompatibleTier1CostBenchmark({ metal: 'Ag', metric: 'AISC_AG_CO_PRODUCT_USD_PER_TOZ', basisId: 'S_AND_P_CO_PRODUCT_AISC_AG', costBaseYear: 2025 }), TIER1_COST_BENCHMARKS.Ag);

assert.equal(TIER1_COST_BENCHMARK_SNAPSHOTS.Cu.length, 1);
assert.equal(getCompatibleTier1CostBenchmark({ metal: 'Cu', metric: 'C1_CU_USD_PER_LB', basisId: 'S_AND_P_CO_PRODUCT_C1_CU', costBaseYear: 2024 }), TIER1_COST_BENCHMARKS.Cu);
assert.equal(getCompatibleTier1CostBenchmark({ metal: 'Cu', metric: 'C1_CU_USD_PER_LB', basisId: 'S_AND_P_CO_PRODUCT_C1_CU', costBaseYear: 2025 }), null);

console.log('costBenchmarkBasis.test.ts passed');
