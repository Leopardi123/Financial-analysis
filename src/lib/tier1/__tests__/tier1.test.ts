import assert from 'node:assert/strict';
import {
  TIER1_COST_BENCHMARKS,
  TIER1_POLICY,
  TIER1_PRODUCTION_THRESHOLDS,
  getTier1CostBenchmarkTodos,
} from '../config.ts';
import {
  assessCapitalReturns,
  assessCombinedScale,
  assessCost,
  assessCycle,
  assessLom,
  classifyCostAgainstPercentiles,
  classifyTier,
  determinePrimaryMetal,
} from '../preRevenue.ts';
import {
  applyRelativeCycleToPriceSeries,
  computeTier1CycleMultiplier,
  toMonthlyLast,
} from '../cycle.ts';
import {
  getFredCommodityPriceMapping,
  getFredHistoryCommodityPriceMapping,
  isFredHistoryOnlyCommodityPriceKey,
} from '../../prices/commodityFredConfig.ts';

assert.equal(TIER1_PRODUCTION_THRESHOLDS.Au.minimumAnnualPayable, 300_000);
assert.equal(TIER1_PRODUCTION_THRESHOLDS.Ag.minimumAnnualPayable, 15_000_000);
assert.equal(TIER1_PRODUCTION_THRESHOLDS.Cu.minimumAnnualPayable, 100_000);
assert.equal(TIER1_PRODUCTION_THRESHOLDS.Zn.minimumAnnualPayable, 150_000);
assert.equal(TIER1_PRODUCTION_THRESHOLDS.Pb.minimumAnnualPayable, 100_000);
assert.equal(TIER1_PRODUCTION_THRESHOLDS.Ni.minimumAnnualPayable, 40_000);
assert.equal(TIER1_PRODUCTION_THRESHOLDS.Pt.minimumAnnualPayable, 100_000);
assert.equal(TIER1_PRODUCTION_THRESHOLDS.Pd.minimumAnnualPayable, 150_000);

assert.equal(assessLom(15).tier, 1);
assert.equal(assessLom(14).tier, 2);
assert.equal(assessLom(10).tier, 2);
assert.equal(assessLom(9).tier, 3);

assert.equal(assessCapitalReturns(0.25).tier, 1);
assert.equal(assessCapitalReturns(0.249).tier, 2);
assert.equal(assessCapitalReturns(0.20).tier, 2);
assert.equal(assessCapitalReturns(0.199).tier, 3);
assert.equal(assessCapitalReturns(0.15).tier, 3);
assert.equal(assessCapitalReturns(0.149).status, 'FAIL');
assert.equal(assessCapitalReturns(0.149).tier, null);

const scaleTier1 = assessCombinedScale({ Au: 300_000 });
assert.equal(scaleTier1.gate.tier, 1);
assert.equal(scaleTier1.combinedEquivalent, 1);
const polymetalTier1 = assessCombinedScale({ Au: 150_000, Cu: 50_000 });
assert.equal(polymetalTier1.gate.tier, 1);
assert.equal(polymetalTier1.combinedEquivalent, 1);
const scaleTier2 = assessCombinedScale({ Au: 120_000 });
assert.equal(scaleTier2.gate.tier, 2);
const scaleTier3 = assessCombinedScale({ Au: 119_999 });
assert.equal(scaleTier3.gate.tier, 3);

const primary = determinePrimaryMetal({ Au: 90, Cu: 10 });
assert.equal(primary.metal, 'Au');
assert.equal(primary.share, 0.9);

const percentileQ1 = classifyCostAgainstPercentiles({ value: 1, p25Max: 2, p50Max: 3 });
assert.equal(percentileQ1.tier, 1);
const percentileQ2 = classifyCostAgainstPercentiles({ value: 2.5, p25Max: 2, p50Max: 3 });
assert.equal(percentileQ2.tier, 2);
const percentileQ3 = classifyCostAgainstPercentiles({ value: 3.5, p25Max: 2, p50Max: 3, p75Max: 4 });
assert.equal(percentileQ3.tier, 3);
const percentileBoundary = classifyCostAgainstPercentiles({ value: 2.01, p25Max: 2, p50Max: 3, uncertaintyAbs: 0.05 });
assert.equal(percentileBoundary.tier, null);

const auBenchmark = TIER1_COST_BENCHMARKS.Au;
const auCostTier1 = assessCost({
  primaryMetal: 'Au',
  primaryMetalRevenueShare: 0.9,
  metric: 'AISC_AU_USD_PER_TOZ',
  value: 1_000,
  costBaseYear: 2025,
  basisId: 'S_AND_P_CO_PRODUCT_AISC_AU',
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(auCostTier1.tier, 1);
assert.equal(auCostTier1.value, 1_000);
assert.equal(auCostTier1.threshold, auBenchmark.q1Max);
const auCostTier2 = assessCost({
  primaryMetal: 'Au',
  primaryMetalRevenueShare: 0.9,
  metric: 'AISC_AU_USD_PER_TOZ',
  value: 1_300,
  costBaseYear: 2025,
  basisId: 'S_AND_P_CO_PRODUCT_AISC_AU',
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(auCostTier2.tier, 2);
const auCostTier3 = assessCost({
  primaryMetal: 'Au',
  primaryMetalRevenueShare: 0.9,
  metric: 'AISC_AU_USD_PER_TOZ',
  value: 1_600,
  costBaseYear: 2025,
  basisId: 'S_AND_P_CO_PRODUCT_AISC_AU',
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(auCostTier3.tier, 3);
const auCostHigh = assessCost({
  primaryMetal: 'Au',
  primaryMetalRevenueShare: 0.9,
  metric: 'AISC_AU_USD_PER_TOZ',
  value: 2_000,
  costBaseYear: 2025,
  basisId: 'S_AND_P_CO_PRODUCT_AISC_AU',
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(auCostHigh.tier, 3);

const primaryNotDominant = assessCost({
  primaryMetal: 'Au',
  primaryMetalRevenueShare: 0.79,
  metric: 'AISC_AU_USD_PER_TOZ',
  value: 1_000,
  costBaseYear: 2025,
  basisId: 'S_AND_P_CO_PRODUCT_AISC_AU',
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(primaryNotDominant.status, 'NOT_VERIFIED');

const unknownCost = assessCost({
  primaryMetal: 'Au',
  primaryMetalRevenueShare: 0.9,
  metric: null,
  value: null,
  costBaseYear: null,
  basisId: null,
  nowUtc: '2026-08-28T00:00:00Z',
});
assert.equal(unknownCost.status, 'NOT_VERIFIED');

const tier1All = classifyTier({
  lom: assessLom(20), scale: assessCombinedScale({ Au: 500_000 }).gate,
  cost: auCostTier1, cycle: assessCycle(100), capitalReturns: assessCapitalReturns(0.30),
});
assert.equal(tier1All.status, 'TIER_1');

const tier2Structural = classifyTier({
  lom: assessLom(12), scale: assessCombinedScale({ Au: 500_000 }).gate,
  cost: auCostTier1, cycle: assessCycle(100), capitalReturns: assessCapitalReturns(0.30),
});
assert.equal(tier2Structural.status, 'TIER_2');

const tier3Structural = classifyTier({
  lom: assessLom(8), scale: assessCombinedScale({ Au: 500_000 }).gate,
  cost: auCostTier1, cycle: assessCycle(100), capitalReturns: assessCapitalReturns(0.30),
});
assert.equal(tier3Structural.status, 'TIER_3');

const tier1MissingCost = classifyTier({
  lom: assessLom(20), scale: assessCombinedScale({ Au: 500_000 }).gate,
  cost: unknownCost, cycle: assessCycle(100), capitalReturns: assessCapitalReturns(0.30),
});
assert.equal(tier1MissingCost.status, 'NOT_VERIFIED');

const tier2MissingCost = classifyTier({
  lom: assessLom(12), scale: assessCombinedScale({ Au: 500_000 }).gate,
  cost: unknownCost, cycle: assessCycle(100), capitalReturns: assessCapitalReturns(0.30),
});
assert.equal(tier2MissingCost.status, 'TIER_2');

const noCycle = classifyTier({
  lom: assessLom(20), scale: assessCombinedScale({ Au: 500_000 }).gate,
  cost: auCostTier1, cycle: assessCycle(-1), capitalReturns: assessCapitalReturns(0.30),
});
assert.equal(noCycle.status, 'NOT_QUALIFIED');

const rows = Array.from({ length: 25 * 12 }, (_, i) => {
  const year = 2000 + Math.floor(i / 12);
  const month = (i % 12) + 1;
  let value = 100;
  if (year >= 2005 && year <= 2006) value = 70;
  if (year >= 2015 && year <= 2016) value = 80;
  return { date: `${year}-${String(month).padStart(2, '0')}-28`, value };
});
const cycle = computeTier1CycleMultiplier(rows);
assert.equal(cycle.status, 'VERIFIED');
assert.ok(cycle.multiplier !== null && cycle.multiplier < 1);
const stressed = applyRelativeCycleToPriceSeries([100, 100, 100, 100, 100], 1, 3, cycle.multiplier!);
assert.equal(stressed[0], 100);
assert.equal(stressed[4], 100);
assert.ok((stressed[1] ?? 0) < 100);
assert.equal(stressed[1], stressed[2]);
assert.equal(stressed[2], stressed[3]);

// Copper current pricing must stay on the existing FMP/COMEX path. Long Tier
// cycle calibration uses the verified IMF/FRED PCOPPUSDM global benchmark as a
// history-only relative-cycle proxy for both canonical Cu units.
for (const copperPriceKey of ['CU_USD_LB', 'CU_USD_TONNE']) {
  assert.equal(getFredCommodityPriceMapping(copperPriceKey), null);
  assert.equal(isFredHistoryOnlyCommodityPriceKey(copperPriceKey), true);
  const copperHistoryMapping = getFredHistoryCommodityPriceMapping(copperPriceKey);
  assert.ok(copperHistoryMapping);
  assert.equal(copperHistoryMapping.fredSeriesId, 'PCOPPUSDM');
  assert.equal(copperHistoryMapping.providerUnit, 'USD_PER_TONNE');
  assert.equal(copperHistoryMapping.frequency, 'monthly');
}

assert.equal(getTier1CostBenchmarkTodos('2027-08-26T00:00:00Z').length, 0);
const staleTodos = getTier1CostBenchmarkTodos('2027-08-30T00:00:00Z');
assert.equal(staleTodos.length, 8);
assert.ok(staleTodos.every((todo) => todo.includes('uppdatera statisk kostnadskurva')));

console.log('tier1.test.ts passed');
