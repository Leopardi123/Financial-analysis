import assert from 'node:assert/strict';
import { computeTier1CycleMultiplier } from '../cycle.ts';
import { getTier1CostBenchmarkTodos } from '../config.ts';
import { assessCapitalReturns, assessCombinedScale, assessLom, classifyCostAgainstPercentiles, classifyTier, type Tier1Gate } from '../preRevenueLegacySnapshot.ts';
import { selectConservativeProjectIrr } from '../projectIrr.ts';
import { canonicalCostMetricForPrimaryMetal, computeCanonicalC1ForProject, costVintageCompatibility } from '../cost.ts';
import { getFredCommodityPriceMapping, getFredHistoryCommodityPriceMapping, isFredHistoryOnlyCommodityPriceKey } from '../../prices/providers/fred.ts';

function monthDate(index: number): string {
  const date = new Date(Date.UTC(2000 + Math.floor(index / 12), index % 12, 28));
  return date.toISOString().slice(0, 10);
}

const history = Array.from({ length: 320 }, (_, index) => {
  const cycle = index % 80;
  const regime = cycle >= 48 && cycle <= 67 ? 0.66 : cycle >= 40 && cycle < 48 ? 0.82 : 1;
  const trend = 100 + index * 0.12;
  return { date: monthDate(index), close: trend * regime };
});

const cycle = computeTier1CycleMultiplier(history);
assert.equal(cycle.status, 'COMPUTABLE');
assert.ok(cycle.multiplier !== null && cycle.multiplier > 0 && cycle.multiplier < 1);
assert.equal(cycle.bearEpisodes, 3);
assert.ok(cycle.method.includes('Modernt uthålligt lågpris'));

assert.equal(assessLom(15).tier, 1);
assert.equal(assessLom(14).tier, 2);
assert.equal(assessLom(9).tier, 3);

const abraSustainedScale = assessCombinedScale({ Ag: 11_130_000, Au: 75_400 }, '10-års fönster 2030–2039');
assert.equal(abraSustainedScale.gate.tier, 2);
assert.ok(abraSustainedScale.combinedEquivalent !== null && abraSustainedScale.combinedEquivalent > 0.99 && abraSustainedScale.combinedEquivalent < 1.0);

const verySmallScale = assessCombinedScale({ Au: 60_000 });
assert.equal(verySmallScale.gate.tier, 3);

const polymetallicPass = assessCombinedScale({ Cu: 60_000, Au: 120_000 });
assert.equal(polymetallicPass.gate.tier, 1);
assert.equal(polymetallicPass.combinedEquivalent, 1);

assert.equal(assessCapitalReturns(0.25).tier, 1);
assert.equal(assessCapitalReturns(0.22).tier, 2);
assert.equal(assessCapitalReturns(0.17).tier, 3);
assert.equal(assessCapitalReturns(0.14).tier, null);
assert.ok(assessCapitalReturns(0.25).reason.includes('spot'));

const ggdLikeProjectIrr = selectConservativeProjectIrr([
  { projectId: 'p3', irr: 1.0263, hasNegativeCashFlow: true, hasPositiveCashFlow: true },
  { projectId: 'p2', irr: 0.7636, hasNegativeCashFlow: true, hasPositiveCashFlow: true },
  { projectId: 'p4', irr: null, hasNegativeCashFlow: false, hasPositiveCashFlow: true },
]);
assert.equal(ggdLikeProjectIrr.irr, 0.7636);
assert.deepEqual(ggdLikeProjectIrr.ignoredNoInvestmentProjectIds, ['p4']);
assert.deepEqual(ggdLikeProjectIrr.unresolvedProjectIds, []);

const unresolvedInvestmentProject = selectConservativeProjectIrr([
  { projectId: 'p1', irr: 0.30, hasNegativeCashFlow: true, hasPositiveCashFlow: true },
  { projectId: 'p2', irr: null, hasNegativeCashFlow: true, hasPositiveCashFlow: true },
]);
assert.equal(unresolvedInvestmentProject.irr, null);
assert.deepEqual(unresolvedInvestmentProject.unresolvedProjectIds, ['p2']);

const canonicalCuInput = {
  projectId: 'cu-test', primaryMetal: 'Cu' as const, productionStartPeriod: 1, masterN: 2,
  payableQtyByMetal: { Cu: [0, 100, 100] }, payableQtyUnitByMetal: { Cu: 'lb' },
  operatingCostsUSD: [0, 50, 50], siteGandA_USD: [0, 10, 10], byproductCreditsUSD: [0, 0, 0],
  economicsBreakdown: {
    meta: { costBaseYear: 2025 },
    cogs: { miningUSD: [0, 20, 20], millingUSD: [0, 20, 20], utilitiesUSD: [0, 5, 5], maintenanceUSD: [0, 5, 5], campUSD: [0, 0, 0] },
    selling: { treatmentChargesUSD: [0, 3, 3], refiningChargesUSD: [0, 2, 2], transportUSD: [0, 2, 2] },
  },
  revenueByMetalUSD: { Cu: [0, 1_000, 1_000] },
};

const canonicalCu = computeCanonicalC1ForProject(canonicalCuInput);
assert.equal(canonicalCu.status, 'COMPUTABLE');
assert.equal(canonicalCu.metric, 'C1_CU_USD_PER_LB');
assert.equal(canonicalCu.costBaseYear, 2025);
assert.ok(canonicalCu.value !== null && Math.abs(canonicalCu.value - 0.60) < 1e-12);
assert.equal(canonicalCu.numeratorUSD, 120);
assert.equal(canonicalCu.denominator, 200);
assert.ok(canonicalCu.reason.includes('Santa Cruz/S&P-kompatibel'));

const canonicalNickel = canonicalCostMetricForPrimaryMetal({ ...canonicalCuInput, projectId: 'ni-test', primaryMetal: 'Ni', payableQtyByMetal: { Ni: [0, 100, 100] }, payableQtyUnitByMetal: { Ni: 'lb' }, revenueByMetalUSD: { Ni: [0, 1_000, 1_000] } });
assert.equal(canonicalNickel.status, 'COMPUTABLE');
assert.equal(canonicalNickel.metric, 'C1_NI_USD_PER_LB');
assert.equal(canonicalNickel.costBaseYear, 2025);
assert.ok(canonicalNickel.value !== null && Math.abs(canonicalNickel.value - 0.60) < 1e-12);
assert.equal(canonicalNickel.numeratorUSD, 120);

assert.equal(classifyCostAgainstPercentiles({ value: 1, q1Max: 1.5, p50Max: 2, p75Max: 2.5 }).tier, 1);
assert.equal(classifyCostAgainstPercentiles({ value: 1.75, q1Max: 1.5, p50Max: 2, p75Max: 2.5 }).tier, 2);
assert.equal(classifyCostAgainstPercentiles({ value: 2.25, q1Max: 1.5, p50Max: 2, p75Max: 2.5 }).tier, 3);
assert.equal(classifyCostAgainstPercentiles({ value: 3, q1Max: 1.5, p50Max: 2, p75Max: 2.5 }).tier, 3);

const gates = (cost: Tier1Gate): Parameters<typeof classifyTier>[0] => ({
  lom: { status: 'PASS', tier: 1, value: 20, threshold: 15, unit: 'years', reason: '' },
  scale: { status: 'PASS', tier: 1, value: 1.2, threshold: 1, unit: 'scale-equivalent', reason: '' },
  cost,
  cycle: { status: 'PASS', tier: 1, value: 1, threshold: 0, unit: 'USD', reason: '' },
  capitalReturns: { status: 'PASS', tier: 1, value: 0.3, threshold: 0.25, unit: 'ratio', reason: '' },
});
assert.equal(classifyTier(gates({ status: 'PASS', tier: 1, value: 1, threshold: 1.4, unit: 'USD/lb', reason: '' })).status, 'TIER_1');
assert.equal(classifyTier(gates({ status: 'FAIL', tier: 2, value: 1.8, threshold: 1.4, unit: 'USD/lb', reason: '' })).status, 'TIER_2');

assert.ok(Array.isArray(getTier1CostBenchmarkTodos('2027-09-01T00:00:00Z')));
assert.equal(costVintageCompatibility(2024, 2024).status, 'MATCH');
assert.equal(getFredCommodityPriceMapping('ZN_USD_LB')?.fredSeriesId, 'PZINCUSDM');
assert.equal(getFredHistoryCommodityPriceMapping('ZN_USD_LB')?.fredSeriesId, 'PZINCUSDM');
assert.equal(isFredHistoryOnlyCommodityPriceKey('ZN_USD_LB'), false);

console.log('tier1 legacy snapshot test passed');
