import assert from 'node:assert/strict';
import { TIER1_COST_BENCHMARKS, TIER1_PRODUCTION_THRESHOLDS } from '../config.ts';

assert.deepEqual(
  Object.fromEntries(Object.entries(TIER1_PRODUCTION_THRESHOLDS).map(([metal, row]) => [metal, [row.minimumAnnualPayable, row.unit]])),
  {
    Au: [300_000, 'toz'],
    Ag: [15_000_000, 'toz'],
    Cu: [100_000, 'tonne'],
    Zn: [150_000, 'tonne'],
    Pb: [100_000, 'tonne'],
    Ni: [40_000, 'tonne'],
    Pt: [100_000, 'toz'],
    Pd: [150_000, 'toz'],
  },
);

assert.equal(TIER1_COST_BENCHMARKS.Au.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Au.basisId, 'S_AND_P_CO_PRODUCT_AISC_AU');

assert.equal(TIER1_COST_BENCHMARKS.Ag.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Ag.basisId, 'JUANICIPIO_REPORTED_AGEQ_AISC_MIXED_Q1_EVIDENCE');

assert.equal(TIER1_COST_BENCHMARKS.Cu.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Cu.basisId, 'S_AND_P_CO_PRODUCT_C1_CU');

assert.equal(TIER1_COST_BENCHMARKS.Zn.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Pb.comparisonEnabled, false);
assert.equal(TIER1_COST_BENCHMARKS.Zn.basisId, 'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS');

assert.equal(TIER1_COST_BENCHMARKS.Ni.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Ni.basisId, 'JAGUAR_NI_C1_MINE_SITE_GA');
assert.equal(TIER1_COST_BENCHMARKS.Ni.q1Max, 3.34);
assert.ok(TIER1_COST_BENCHMARKS.Ni.notes.includes('payable nickel basis'));
assert.ok(TIER1_COST_BENCHMARKS.Ni.notes.includes('2,67'));

assert.equal(TIER1_COST_BENCHMARKS.Pt.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Pd.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Pt.basisId, 'VALTERRA_PGM_3E_AISC_SOLD');
assert.equal(TIER1_COST_BENCHMARKS.Pd.basisId, 'VALTERRA_PGM_3E_AISC_SOLD');
assert.equal(TIER1_COST_BENCHMARKS.Pt.q1Max, 835);
assert.ok(TIER1_COST_BENCHMARKS.Pt.notes.includes('första kvartilen'));
assert.ok(TIER1_COST_BENCHMARKS.Pt.evidenceUrl?.includes('integrated-report-2025.pdf'));

console.log('costBenchmarkBasis.test.ts passed');
