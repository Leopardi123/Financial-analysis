import assert from 'node:assert/strict';
import { TIER1_COST_BENCHMARKS } from '../config.ts';

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

assert.equal(TIER1_COST_BENCHMARKS.Pt.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Pd.comparisonEnabled, true);
assert.equal(TIER1_COST_BENCHMARKS.Pt.basisId, 'VALTERRA_PGM_3E_AISC_SOLD');
assert.equal(TIER1_COST_BENCHMARKS.Pd.basisId, 'VALTERRA_PGM_3E_AISC_SOLD');

console.log('costBenchmarkBasis.test.ts passed');
