import assert from 'node:assert/strict';
import { TIER1_COST_BENCHMARKS, getCompatibleTier1CostBenchmark } from '../config.ts';
import { assessCostAgainstBenchmark } from '../costBenchmarkAssessment.ts';

const gold2025 = getCompatibleTier1CostBenchmark({
  metal: 'Au',
  metric: 'AISC_AU_USD_PER_TOZ',
  basisId: 'S_AND_P_CO_PRODUCT_AISC_AU',
  costBaseYear: 2025,
});
assert.equal(gold2025, TIER1_COST_BENCHMARKS.Au);

for (const [value, expectedTier] of [
  [1_100, 1],
  [1_350, 2],
  [1_700, 3],
  [2_000, 3],
] as const) {
  const gate = assessCostAgainstBenchmark({
    primaryMetal: 'Au',
    primaryMetalRevenueShare: 1,
    metric: 'AISC_AU_USD_PER_TOZ',
    value,
    benchmark: gold2025!,
    nowUtc: '2026-08-28T00:00:00Z',
  });
  assert.equal(gate.tier, expectedTier);
}

const noGold2024 = getCompatibleTier1CostBenchmark({
  metal: 'Au',
  metric: 'AISC_AU_USD_PER_TOZ',
  basisId: 'S_AND_P_CO_PRODUCT_AISC_AU',
  costBaseYear: 2024,
});
assert.equal(noGold2024, null);

const nonDominantGold = assessCostAgainstBenchmark({
  primaryMetal: 'Au',
  primaryMetalRevenueShare: 0.79,
  metric: 'AISC_AU_USD_PER_TOZ',
  value: 1_100,
  benchmark: gold2025!,
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(nonDominantGold.tier, null);
assert.equal(nonDominantGold.status, 'NOT_VERIFIED');

console.log('costBenchmarkAssessment.test.ts passed');
