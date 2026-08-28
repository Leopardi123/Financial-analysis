import assert from 'node:assert/strict';
import { TIER1_COST_BENCHMARKS, getCompatibleTier1CostBenchmark } from '../config.ts';
import { assessCostAgainstBenchmark } from '../costBenchmarkAssessment.ts';
import { extractReportedCostEvidence, reportedCostWeightInBenchmarkUnits } from '../reportedCost.ts';

const valid = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB',
      basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
      value: 1.21,
      unit: 'USD/lb',
      costBaseYear: 2025,
      sourceId: 'pfs-2025',
      pageOrTable: 'Table 18-5',
    }],
  },
}, 'C1_CU_USD_PER_LB');
assert.equal(valid.status, 'AVAILABLE');
assert.equal(valid.value, 1.21);
assert.equal(valid.basisId, 'S_AND_P_CO_PRODUCT_C1_CU');
assert.equal(valid.costBaseYear, 2025);

const cleanSilver = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'AISC_AG_CO_PRODUCT_USD_PER_TOZ',
      basisId: 'S_AND_P_CO_PRODUCT_AISC_AG',
      value: 18.81,
      unit: 'USD/toz',
      costBaseYear: 2024,
      sourceId: 'technical-report-2024',
      pageOrTable: 'AISC table',
    }],
  },
}, 'AISC_AG_CO_PRODUCT_USD_PER_TOZ');
assert.equal(cleanSilver.status, 'AVAILABLE');
assert.equal(cleanSilver.value, 18.81);
assert.equal(cleanSilver.basisId, 'S_AND_P_CO_PRODUCT_AISC_AG');
assert.equal(cleanSilver.costBaseYear, 2024);

// Legacy AgEq evidence remains parseable when explicitly requested but must not
// satisfy the new clean co-product Ag metric by name or by implication.
const legacyAgEqOnly = {
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'AISC_AGEQ_USD_PER_TOZ',
      basisId: 'JUANICIPIO_REPORTED_AGEQ_AISC_MIXED_Q1_EVIDENCE',
      value: 12.9,
      unit: 'USD/toz',
      costBaseYear: 2025,
      sourceId: 'legacy-ageq',
      pageOrTable: 'reported AISC',
    }],
  },
};
assert.equal(extractReportedCostEvidence(legacyAgEqOnly, 'AISC_AGEQ_USD_PER_TOZ').status, 'AVAILABLE');
assert.equal(extractReportedCostEvidence(legacyAgEqOnly, 'AISC_AG_CO_PRODUCT_USD_PER_TOZ').status, 'NOT_AVAILABLE');

const absent = extractReportedCostEvidence({ economicsBreakdown: {} }, 'C1_CU_USD_PER_LB');
assert.equal(absent.status, 'NOT_AVAILABLE');

const missingSource = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB',
      basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
      value: 1.21,
      unit: 'USD/lb',
      costBaseYear: 2025,
    }],
  },
}, 'C1_CU_USD_PER_LB');
assert.equal(missingSource.status, 'INVALID');
assert.ok(missingSource.reason.includes('sourceId'));

const duplicate = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [
      { metric: 'C1_CU_USD_PER_LB' },
      { metric: 'C1_CU_USD_PER_LB' },
    ],
  },
}, 'C1_CU_USD_PER_LB');
assert.equal(duplicate.status, 'INVALID');

const lbWeight = reportedCostWeightInBenchmarkUnits({
  payableSeries: [0, 1000, 2000],
  payableUnit: 'kg',
  benchmarkUnit: 'USD/lb',
});
assert.ok(lbWeight !== null && Math.abs(lbWeight - 6613.867865546327) < 1e-9);

const ozWeight = reportedCostWeightInBenchmarkUnits({
  payableSeries: [0, 31.1034768],
  payableUnit: 'g',
  benchmarkUnit: 'USD/toz',
});
assert.ok(ozWeight !== null && Math.abs(ozWeight - 1) < 1e-9);

// Real-project Au end-to-end regression: Bilboes Gold Project 2025 TRS,
// Table 19-6 (p. 158) reports LOM AISC = US$1,061/oz real 2025 and explicitly
// shows Other (Corporate G&A, Exploration, etc.) = US$0. Table 19-4 (p. 157)
// reports 1.55 Moz recovered gold. This fixture deliberately tests the same
// reported-cost evidence contract used by the runtime wrapper; no benchmark
// year, basis or percentile is inferred in the test.
const bilboesRawProjectJson = {
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'AISC_AU_USD_PER_TOZ',
      basisId: 'S_AND_P_CO_PRODUCT_AISC_AU',
      value: 1_061,
      unit: 'USD/toz',
      costBaseYear: 2025,
      sourceId: 'bilboes-gold-project-trs-2025',
      pageOrTable: 'Table 19-6, p. 158',
    }],
  },
};
const bilboesAisc = extractReportedCostEvidence(bilboesRawProjectJson, 'AISC_AU_USD_PER_TOZ');
assert.equal(bilboesAisc.status, 'AVAILABLE');
assert.equal(bilboesAisc.value, 1_061);
assert.equal(bilboesAisc.basisId, 'S_AND_P_CO_PRODUCT_AISC_AU');
assert.equal(bilboesAisc.costBaseYear, 2025);
assert.equal(bilboesAisc.pageOrTable, 'Table 19-6, p. 158');

const bilboesWeight = reportedCostWeightInBenchmarkUnits({
  payableSeries: [0, 1_550_000],
  payableUnit: 'toz',
  benchmarkUnit: 'USD/toz',
});
assert.equal(bilboesWeight, 1_550_000);

const au2025 = getCompatibleTier1CostBenchmark({
  metal: 'Au',
  metric: bilboesAisc.metric,
  basisId: bilboesAisc.basisId!,
  costBaseYear: bilboesAisc.costBaseYear!,
});
assert.equal(au2025, TIER1_COST_BENCHMARKS.Au);
assert.equal(au2025?.benchmarkKind, 'FULL_QUARTILE_CURVE');
assert.equal(au2025?.q1Max, 1_228);
assert.equal(au2025?.p50Max, 1_501);
assert.equal(au2025?.p75Max, 1_840);

const bilboesCostGate = assessCostAgainstBenchmark({
  primaryMetal: 'Au',
  primaryMetalRevenueShare: 1,
  metric: bilboesAisc.metric,
  value: bilboesAisc.value!,
  benchmark: au2025!,
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(bilboesCostGate.status, 'PASS');
assert.equal(bilboesCostGate.tier, 1);
assert.equal(bilboesCostGate.value, 1_061);
assert.equal(bilboesCostGate.threshold, 1_228);

console.log('reportedCost.test.ts passed');
