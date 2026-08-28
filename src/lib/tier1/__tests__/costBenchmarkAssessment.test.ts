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

const silver2024 = getCompatibleTier1CostBenchmark({
  metal: 'Ag',
  metric: 'AISC_AG_CO_PRODUCT_USD_PER_TOZ',
  basisId: 'S_AND_P_CO_PRODUCT_AISC_AG',
  costBaseYear: 2024,
});
assert.equal(silver2024, TIER1_COST_BENCHMARKS.Ag);
const silverNoBoundaries = assessCostAgainstBenchmark({
  primaryMetal: 'Ag',
  primaryMetalRevenueShare: 1,
  metric: 'AISC_AG_CO_PRODUCT_USD_PER_TOZ',
  value: 18.81,
  benchmark: silver2024!,
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(silverNoBoundaries.tier, null);
assert.equal(silverNoBoundaries.status, 'NOT_VERIFIED');
assert.equal(silverNoBoundaries.threshold, null);
assert.ok(silverNoBoundaries.reason.includes('P25/P50/P75'));

// Copper: the S&P curve is 2024 actual on co-product C1 basis. The percentile
// values are digitised from slide 10 and therefore carry ±0.05 USD/lb read-off
// uncertainty. Values inside the boundary bands must fail closed.
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
    nowUtc: '2026-08-28T00:00:00Z',
  });
  assert.equal(gate.tier, expectedTier, `Cu ${value} USD/lb should be Cost Tier ${expectedTier}`);
}

for (const value of [1.40, 1.76] as const) {
  const gate = assessCostAgainstBenchmark({
    primaryMetal: 'Cu',
    primaryMetalRevenueShare: 1,
    metric: 'C1_CU_USD_PER_LB',
    value,
    benchmark: copper2024!,
    nowUtc: '2026-08-28T00:00:00Z',
  });
  assert.equal(gate.status, 'NOT_VERIFIED');
  assert.equal(gate.tier, null);
  assert.ok(gate.reason.includes('digitaliserade'));
}

// Real-project exact-vintage canonical regression: Arizona Sonoran Cactus 2024
// PEA reports 5,338.683 Mlb payable copper and LOM cash operating costs of
// US$9.341bn = mining 7.252bn + process 2.039bn + G&A 0.050bn. Royalties are
// separately reported and excluded here. This matches the engine's single-
// product cathode S&P/Santa-Cruz-compatible canonical C1 bridge.
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

// Cactus is intentionally NOT forced into Tier 2 or 3: its canonical ~1.75
// USD/lb lies inside the ±0.05 uncertainty band around digitised P50=1.76.
const cactusGate = assessCostAgainstBenchmark({
  primaryMetal: 'Cu',
  primaryMetalRevenueShare: 1,
  metric: cactusCanonical.metric!,
  value: cactusCanonical.value!,
  benchmark: copper2024!,
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(cactusGate.status, 'NOT_VERIFIED');
assert.equal(cactusGate.tier, null);
assert.ok(cactusGate.reason.includes('P50'));

console.log('costBenchmarkAssessment.test.ts passed');
