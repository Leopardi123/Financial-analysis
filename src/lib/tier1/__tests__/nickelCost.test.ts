import assert from 'node:assert/strict';
import {
  TIER1_COST_BENCHMARKS,
  TIER1_NI_BMI_2025_COST_BENCHMARK,
  getCompatibleTier1CostBenchmark,
} from '../config.ts';
import { assessCostAgainstBenchmark } from '../costBenchmarkAssessment.ts';
import { extractReportedCostEvidence } from '../reportedCost.ts';

// BMI Q2 2025 nickel C1 curve: payable metal using BMI methodology, costs
// inclusive of by-product sales. Percentile boundaries are digitised from the
// public chart. The explicit ±0.15 USD/lb uncertainty is disclosed but the
// best-estimate boundary remains usable for Tier classification.
const bmi2025 = getCompatibleTier1CostBenchmark({
  metal: 'Ni',
  metric: 'C1_NI_USD_PER_LB',
  basisId: 'BMI_PAYABLE_NI_C1_BYPRODUCT_SALES',
  costBaseYear: 2025,
});
assert.equal(bmi2025, TIER1_NI_BMI_2025_COST_BENCHMARK);
assert.equal(bmi2025?.benchmarkKind, 'FULL_QUARTILE_CURVE');
assert.equal(bmi2025?.q1Max, 4.95);
assert.equal(bmi2025?.p50Max, 6.45);
assert.equal(bmi2025?.p75Max, 6.95);
assert.equal(bmi2025?.boundaryUncertaintyAbs, 0.15);

for (const [value, expectedTier] of [
  [4.0, 1],
  [5.5, 2],
  [6.7, 3],
  [7.5, 3],
] as const) {
  const gate = assessCostAgainstBenchmark({
    primaryMetal: 'Ni',
    primaryMetalRevenueShare: 0.45,
    metric: 'C1_NI_USD_PER_LB',
    value,
    benchmark: bmi2025!,
    nowUtc: '2026-08-28T00:00:00Z',
  });
  assert.equal(gate.tier, expectedTier, `Ni ${value} USD/lb should be Cost Tier ${expectedTier}`);
}

for (const [value, expectedTier] of [[4.95, 1], [6.45, 2]] as const) {
  const gate = assessCostAgainstBenchmark({
    primaryMetal: 'Ni',
    primaryMetalRevenueShare: 0.45,
    metric: 'C1_NI_USD_PER_LB',
    value,
    benchmark: bmi2025!,
    nowUtc: '2026-08-28T00:00:00Z',
  });
  assert.equal(gate.tier, expectedTier);
  assert.ok(gate.reason.includes('best-estimate'));
}

// Real-project reported-cost regression: TMC NORI-D PFS presentation, slide 17,
// reports nickel C1 cash cost of US$1,065/t including by-product credits. The
// chart notes that BMI cost information is corrected to payable metal using BMI
// methodology and that costs include by-product sales. Convert only the unit;
// no basis or vintage conversion is inferred.
const tmcC1UsdPerLb = 1_065 / 2_204.6226218487757;
assert.ok(Math.abs(tmcC1UsdPerLb - 0.48307587405) < 1e-12);

const tmcRawProjectJson = {
  economicsBreakdown: {
    reportedCostMetrics: [{
      metric: 'C1_NI_USD_PER_LB',
      basisId: 'BMI_PAYABLE_NI_C1_BYPRODUCT_SALES',
      value: tmcC1UsdPerLb,
      unit: 'USD/lb',
      costBaseYear: 2025,
      sourceId: 'tmc-nori-d-pfs-2025',
      pageOrTable: 'slide 17, Nickel C1 Cost Curve 2025',
    }],
  },
};
const tmcReported = extractReportedCostEvidence(tmcRawProjectJson, 'C1_NI_USD_PER_LB');
assert.equal(tmcReported.status, 'AVAILABLE');
assert.equal(tmcReported.basisId, 'BMI_PAYABLE_NI_C1_BYPRODUCT_SALES');
assert.equal(tmcReported.costBaseYear, 2025);
assert.ok(tmcReported.value !== null && Math.abs(tmcReported.value - tmcC1UsdPerLb) < 1e-12);

const tmcBenchmark = getCompatibleTier1CostBenchmark({
  metal: 'Ni',
  metric: tmcReported.metric,
  basisId: tmcReported.basisId!,
  costBaseYear: tmcReported.costBaseYear!,
});
assert.equal(tmcBenchmark, TIER1_NI_BMI_2025_COST_BENCHMARK);
const tmcGate = assessCostAgainstBenchmark({
  primaryMetal: 'Ni',
  primaryMetalRevenueShare: 0.45,
  metric: tmcReported.metric,
  value: tmcReported.value!,
  benchmark: tmcBenchmark!,
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(tmcGate.status, 'PASS');
assert.equal(tmcGate.tier, 1);

// Existing Jaguar basis is deliberately retained as a separate pass-only
// family. The engine must never silently treat a Jaguar-basis cost as BMI.
const jaguar2025 = getCompatibleTier1CostBenchmark({
  metal: 'Ni',
  metric: 'C1_NI_USD_PER_LB',
  basisId: 'JAGUAR_NI_C1_MINE_SITE_GA',
  costBaseYear: 2025,
});
assert.equal(jaguar2025, TIER1_COST_BENCHMARKS.Ni);
assert.equal(jaguar2025?.benchmarkKind, 'Q1_REFERENCE_CEILING');
assert.equal(jaguar2025?.q1Max, 3.34);
assert.equal(jaguar2025?.p50Max, null);
assert.notEqual(jaguar2025, bmi2025);

console.log('nickelCost.test.ts passed');
