import assert from 'node:assert/strict';
import { TIER1_COST_BENCHMARKS } from '../config.ts';
import { assessCostAgainstBenchmark } from '../costBenchmarkAssessment.ts';
import { extractReportedCostEvidence, reportedCostWeightInBenchmarkUnits } from '../reportedCost.ts';

const minimal = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB',
      value: 1.21,
      unit: 'USD/lb',
    }],
  },
}, 'C1_CU_USD_PER_LB');
assert.equal(minimal.status, 'AVAILABLE');
assert.equal(minimal.value, 1.21);
assert.equal(minimal.basisId, null);
assert.equal(minimal.costBaseYear, null);

const negativeCopperC1 = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB',
      value: -0.17,
      unit: 'USD/lb',
    }],
  },
}, 'C1_CU_USD_PER_LB');
assert.equal(negativeCopperC1.status, 'AVAILABLE');
assert.equal(negativeCopperC1.value, -0.17);

const legacyRich = extractReportedCostEvidence({
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
}, 'AISC_AU_USD_PER_TOZ');
assert.equal(legacyRich.status, 'AVAILABLE');
assert.equal(legacyRich.value, 1_061);
assert.equal(legacyRich.basisId, 'S_AND_P_CO_PRODUCT_AISC_AU');
assert.equal(legacyRich.costBaseYear, 2025);
assert.equal(legacyRich.pageOrTable, 'Table 19-6, p. 158');

// A newer usable entry later in the JSON wins without requiring the old report
// value to remain a hard guard on the current model.
const updated = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [
      { metric: 'AISC_AU_USD_PER_TOZ', value: 1_400, unit: 'USD/toz' },
      { metric: 'AISC_AU_USD_PER_TOZ', value: 1_650, unit: 'USD/toz' },
    ],
  },
}, 'AISC_AU_USD_PER_TOZ');
assert.equal(updated.status, 'AVAILABLE');
assert.equal(updated.value, 1_650);

const wrongMetric = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{ metric: 'AISC_AGEQ_USD_PER_TOZ', value: 12.9, unit: 'USD/toz' }],
  },
}, 'AISC_AG_CO_PRODUCT_USD_PER_TOZ');
assert.equal(wrongMetric.status, 'NOT_AVAILABLE');

const invalid = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{ metric: 'C1_CU_USD_PER_LB', value: 1.21, unit: 'USD/tonne' }],
  },
}, 'C1_CU_USD_PER_LB');
assert.equal(invalid.status, 'INVALID');

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

const bilboesCostGate = assessCostAgainstBenchmark({
  primaryMetal: 'Au',
  primaryMetalRevenueShare: 1,
  metric: 'AISC_AU_USD_PER_TOZ',
  value: 1_061,
  benchmark: TIER1_COST_BENCHMARKS.Au,
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(bilboesCostGate.status, 'PASS');
assert.equal(bilboesCostGate.tier, 1);
assert.equal(bilboesCostGate.threshold, 1_228);

console.log('reportedCost.test.ts passed');
