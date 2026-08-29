import assert from 'node:assert/strict';
import { TIER1_COST_BENCHMARKS, getCompatibleTier1CostBenchmark } from '../config.ts';
import { assessCostAgainstBenchmark } from '../costBenchmarkAssessment.ts';
import { computeCanonicalC1ForProject } from '../cost.ts';

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
    nowUtc: '2026-08-29T00:00:00Z',
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
  nowUtc: '2026-08-29T00:00:00Z',
});
assert.equal(nonDominantGold.tier, null);
assert.equal(nonDominantGold.status, 'NOT_VERIFIED');

const silver2025 = getCompatibleTier1CostBenchmark({
  metal: 'Ag',
  metric: 'AISC_AG_CO_PRODUCT_USD_PER_TOZ',
  basisId: 'S_AND_P_CO_PRODUCT_AISC_AG',
  costBaseYear: 2025,
});
assert.equal(silver2025, TIER1_COST_BENCHMARKS.Ag);
assert.equal(silver2025?.benchmarkKind, 'FULL_QUARTILE_CURVE');
assert.equal(silver2025?.q1Max, 14.0);
assert.equal(silver2025?.p50Max, 18.5);
assert.equal(silver2025?.p75Max, 22.5);
const silverNearMedian = assessCostAgainstBenchmark({
  primaryMetal: 'Ag',
  primaryMetalRevenueShare: 1,
  metric: 'AISC_AG_CO_PRODUCT_USD_PER_TOZ',
  value: 18.81,
  benchmark: silver2025!,
  nowUtc: '2026-08-29T00:00:00Z',
});
assert.equal(silverNearMedian.tier, 3);
assert.equal(silverNearMedian.status, 'FAIL');
assert.ok(silverNearMedian.reason.includes('best-estimate'));

// Copper: the S&P curve is 2024 actual on co-product C1 basis. The percentile
// values carry ±0.05 USD/lb read-off uncertainty. Best-estimate boundaries are
// used for classification while proximity remains visible as diagnostics.
const copper2024 = getCompatibleTier1CostBenchmark({
  metal: 'Cu',
  metric: 'C1_CU_USD_PER_LB',
  basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
  costBaseYear: 2024,
});
assert.equal(copper2024, TIER1_COST_BENCHMARKS.Cu);
assert.equal(getCompatibleTier1CostBenchmark({
  metal: 'Cu', metric: 'C1_CU_USD_PER_LB', basisId: 'S_AND_P_CO_PRODUCT_C1_CU', costBaseYear: 2025,
}), null);

for (const [value, expectedTier] of [
  [1.32, 1],
  [1.38, 1],
  [1.50, 2],
  [1.90, 3],
  [2.30, 3],
] as const) {
  const gate = assessCostAgainstBenchmark({
    primaryMetal: 'Cu',
    primaryMetalRevenueShare: 1,
    metric: 'C1_CU_USD_PER_LB',
    value,
    benchmark: copper2024!,
    nowUtc: '2026-08-29T00:00:00Z',
  });
  assert.equal(gate.tier, expectedTier, `Cu ${value} USD/lb should be Cost Tier ${expectedTier}`);
}

for (const [value, expectedTier] of [[1.40, 1], [1.76, 2]] as const) {
  const gate = assessCostAgainstBenchmark({
    primaryMetal: 'Cu',
    primaryMetalRevenueShare: 1,
    metric: 'C1_CU_USD_PER_LB',
    value,
    benchmark: copper2024!,
    nowUtc: '2026-08-29T00:00:00Z',
  });
  assert.equal(gate.tier, expectedTier);
  assert.ok(gate.reason.includes('best-estimate'));
}

// Real-project exact-vintage canonical regression: Arizona Sonoran Cactus 2024
// PEA reports 5,338.683 Mlb payable copper and LOM cash operating costs of
// US$9.341bn = mining 7.252bn + process 2.039bn + G&A 0.050bn. Royalties are
// separately reported and excluded here.
const cactusCanonical = computeCanonicalC1ForProject({
  projectId: 'cactus-2024-pea',
  primaryMetal: 'Cu',
  productionStartPeriod: 1,
  masterN: 1,
  payableQtyByMetal: { Cu: [0, 5_338_683_000] },
  payableQtyUnitByMetal: { Cu: 'lb' },
  operatingCostsUSD: [0, 9_291_000_000],
  siteGandA_USD: [0, 50_000_000],
  byproductCreditsUSD: [0, 0],
  economicsBreakdown: {
    meta: { costBaseYear: 2024 },
    cogs: {
      miningUSD: [0, 7_252_000_000],
      millingUSD: [0, 2_039_000_000],
      utilitiesUSD: [0, 0],
      maintenanceUSD: [0, 0],
      campUSD: [0, 0],
    },
  },
  revenueByMetalUSD: { Cu: [0, 20_821_000_000] },
});
assert.equal(cactusCanonical.status, 'COMPUTABLE');
assert.equal(cactusCanonical.metric, 'C1_CU_USD_PER_LB');
assert.equal(cactusCanonical.costBaseYear, 2024);
assert.ok(cactusCanonical.value !== null && Math.abs(cactusCanonical.value - 1.7496824591383306) < 1e-12);

const cactusGate = assessCostAgainstBenchmark({
  primaryMetal: 'Cu',
  primaryMetalRevenueShare: 1,
  metric: cactusCanonical.metric!,
  value: cactusCanonical.value!,
  benchmark: copper2024!,
  nowUtc: '2026-08-29T00:00:00Z',
});
assert.equal(cactusGate.status, 'FAIL');
assert.equal(cactusGate.tier, 2);
assert.ok(cactusGate.reason.includes('best-estimate'));

console.log('costBenchmarkAssessment.test.ts passed');
