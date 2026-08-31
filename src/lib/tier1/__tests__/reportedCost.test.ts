import assert from 'node:assert/strict';
import { TIER1_COST_BENCHMARKS } from '../config.ts';
import { assessCostAgainstBenchmark } from '../costBenchmarkAssessment.ts';
import { extractReportedCostEvidence, reportedCostWeightInBenchmarkUnits } from '../reportedCost.ts';
import { assessReportedCostBenchmarkCompatibility } from '../reportedCostCompatibility.ts';

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
const minimalCompatibility = assessReportedCostBenchmarkCompatibility({
  evidence: minimal,
  benchmark: TIER1_COST_BENCHMARKS.Cu,
});
assert.equal(minimalCompatibility.status, 'INSUFFICIENT_DEFINITION');

const arcticCashCost = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB',
      reportedLabel: 'Cash Costs, Net of By-product Credits',
      value: 0.72,
      unit: 'USD/lb',
      definitionNotes: 'FS wording; net of by-product credits.',
      sourceId: 'arctic-fs-2023',
      pageOrTable: 'Table 22-2, p.390',
    }],
  },
}, 'C1_CU_USD_PER_LB');
assert.equal(arcticCashCost.status, 'AVAILABLE');
assert.equal(arcticCashCost.value, 0.72);
assert.equal(arcticCashCost.reportedLabel, 'Cash Costs, Net of By-product Credits');
const arcticCompatibility = assessReportedCostBenchmarkCompatibility({
  evidence: arcticCashCost,
  benchmark: TIER1_COST_BENCHMARKS.Cu,
});
assert.equal(arcticCompatibility.status, 'INSUFFICIENT_DEFINITION');
assert.match(arcticCompatibility.reason, /basis/i);

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
assert.equal(assessReportedCostBenchmarkCompatibility({
  evidence: negativeCopperC1,
  benchmark: TIER1_COST_BENCHMARKS.Cu,
}).status, 'INSUFFICIENT_DEFINITION');

const exactCopper = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB',
      value: 1.21,
      unit: 'USD/lb',
      basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
      costBaseYear: 2024,
      sourceId: 'pfs-2024',
      pageOrTable: 'Table 22-4',
    }],
  },
}, 'C1_CU_USD_PER_LB');
const exactCopperCompatibility = assessReportedCostBenchmarkCompatibility({
  evidence: exactCopper,
  benchmark: TIER1_COST_BENCHMARKS.Cu,
});
assert.equal(exactCopperCompatibility.status, 'COMPARABLE');
const exactCopperGate = assessCostAgainstBenchmark({
  primaryMetal: 'Cu',
  primaryMetalRevenueShare: 0.90,
  metric: 'C1_CU_USD_PER_LB',
  value: exactCopper.value!,
  benchmark: TIER1_COST_BENCHMARKS.Cu,
  nowUtc: '2026-08-30T00:00:00Z',
});
assert.equal(exactCopperGate.status, 'PASS');
assert.equal(exactCopperGate.tier, 1);

const wrongCopperYear = extractReportedCostEvidence({
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB',
      value: 1.21,
      unit: 'USD/lb',
      basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
      costBaseYear: 2025,
      sourceId: 'pfs-2025',
      pageOrTable: 'Table 22-4',
    }],
  },
}, 'C1_CU_USD_PER_LB');
assert.equal(assessReportedCostBenchmarkCompatibility({
  evidence: wrongCopperYear,
  benchmark: TIER1_COST_BENCHMARKS.Cu,
}).status, 'NOT_COMPARABLE');

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
assert.equal(assessReportedCostBenchmarkCompatibility({
  evidence: legacyRich,
  benchmark: TIER1_COST_BENCHMARKS.Au,
}).status, 'COMPARABLE');

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
assert.equal(assessReportedCostBenchmarkCompatibility({
  evidence: updated,
  benchmark: TIER1_COST_BENCHMARKS.Au,
}).status, 'INSUFFICIENT_DEFINITION');

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

console.log('reportedCost.test.ts passed');
