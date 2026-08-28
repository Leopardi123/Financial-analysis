import assert from 'node:assert/strict';
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

console.log('reportedCost.test.ts passed');
