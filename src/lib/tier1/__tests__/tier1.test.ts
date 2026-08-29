import assert from 'node:assert/strict';
import { computeTier1CycleMultiplier } from '../cycle.ts';
import { getTier1CostBenchmarkTodos } from '../config.ts';
import { assessCapitalReturns, assessCombinedScale, assessLom, classifyCostAgainstPercentiles, classifyTier, type Tier1Gate } from '../preRevenue.ts';
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
assert.ok(cycle.multiplier !== null && cycle.multiplier > 0.5 && cycle.multiplier < 0.95);
assert.ok(cycle.bearEpisodes >= 2);
assert.ok(cycle.method.includes('Uthålliga lågcykelepisoder'));

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
assert.equal(canonicalNickel.denominator, 200);
assert.ok(canonicalNickel.reason.includes('Jaguar-kompatibel'));

const nickelWithSecondaryCredit = canonicalCostMetricForPrimaryMetal({ ...canonicalCuInput, projectId: 'ni-credit-test', primaryMetal: 'Ni', payableQtyByMetal: { Ni: [0, 100, 100] }, payableQtyUnitByMetal: { Ni: 'lb' }, revenueByMetalUSD: { Ni: [0, 1_000, 1_000], Co: [0, 20, 20] } });
assert.equal(nickelWithSecondaryCredit.status, 'NOT_VERIFIED');
assert.ok(nickelWithSecondaryCredit.reason.includes('Sekundära metallintäkter'));

const cogsMismatch = computeCanonicalC1ForProject({ ...canonicalCuInput, economicsBreakdown: { ...canonicalCuInput.economicsBreakdown, cogs: { ...canonicalCuInput.economicsBreakdown.cogs, miningUSD: [0, 2_020, 2_020] } } });
assert.equal(cogsMismatch.status, 'NOT_VERIFIED');
assert.ok(cogsMismatch.reason.includes('reconcilerar inte'));

const offsiteDoesNotEnterCuC1 = computeCanonicalC1ForProject({ ...canonicalCuInput, economicsBreakdown: { ...canonicalCuInput.economicsBreakdown, selling: { treatmentChargesUSD: [0, 500, 500], refiningChargesUSD: [0, 500, 500], transportUSD: [0, 500, 500] } } });
assert.equal(offsiteDoesNotEnterCuC1.status, 'COMPUTABLE');
assert.equal(offsiteDoesNotEnterCuC1.value, canonicalCu.value);

const copperWithSecondaryMetal = computeCanonicalC1ForProject({ ...canonicalCuInput, revenueByMetalUSD: { Cu: [0, 1_000, 1_000], Au: [0, 10, 10] } });
assert.equal(copperWithSecondaryMetal.status, 'NOT_VERIFIED');
assert.ok(copperWithSecondaryMetal.reason.includes('co-product'));

const copperWithUnallocatedCredit = computeCanonicalC1ForProject({ ...canonicalCuInput, byproductCreditsUSD: [0, 4, 4] });
assert.equal(copperWithUnallocatedCredit.status, 'NOT_VERIFIED');
assert.ok(copperWithUnallocatedCredit.reason.includes('byproductCreditsUSD'));

assert.equal(costVintageCompatibility(2025, '2025 PFS').compatible, true);
assert.equal(costVintageCompatibility(2024, '2025 PFS').compatible, false);
assert.equal(costVintageCompatibility(null, '2025 PFS').compatible, false);

const goldAiscNotYetCanonical = canonicalCostMetricForPrimaryMetal({ ...canonicalCuInput, primaryMetal: 'Au', payableQtyByMetal: { Au: [0, 100, 100] }, payableQtyUnitByMetal: { Au: 'toz' }, revenueByMetalUSD: { Au: [0, 1_000, 1_000] } });
assert.equal(goldAiscNotYetCanonical.status, 'NOT_VERIFIED');
assert.ok(goldAiscNotYetCanonical.reason.includes('Full canonical AISC'));

const costTier1 = classifyCostAgainstPercentiles({ value: 90, p25Max: 100, p50Max: 150, p75Max: 200 });
const costTier2 = classifyCostAgainstPercentiles({ value: 125, p25Max: 100, p50Max: 150, p75Max: 200 });
const costTier3Q3 = classifyCostAgainstPercentiles({ value: 175, p25Max: 100, p50Max: 150, p75Max: 200 });
const costTier3Q4 = classifyCostAgainstPercentiles({ value: 225, p25Max: 100, p50Max: 150, p75Max: 200 });
assert.equal(costTier1.tier, 1);
assert.equal(costTier2.tier, 2);
assert.equal(costTier3Q3.tier, 3);
assert.equal(costTier3Q4.tier, 3);
assert.ok(costTier3Q4.reason.includes('fjärde kvartilen'));

const uncertainP25 = classifyCostAgainstPercentiles({ value: 102, p25Max: 100, p50Max: 150, p75Max: 200, uncertaintyAbs: 5 });
const uncertainP50 = classifyCostAgainstPercentiles({ value: 147, p25Max: 100, p50Max: 150, p75Max: 200, uncertaintyAbs: 5 });
assert.equal(uncertainP25.tier, null);
assert.equal(uncertainP50.tier, null);
assert.ok(uncertainP25.reason.includes('P25'));
assert.ok(uncertainP50.reason.includes('P50'));

const invalidCostCurve = classifyCostAgainstPercentiles({ value: 100, p25Max: 150, p50Max: 140 });
assert.equal(invalidCostCurve.tier, null);

const gate = (tier: 1 | 2 | 3 | null, status: Tier1Gate['status'] = tier === 1 ? 'PASS' : tier === null ? 'NOT_VERIFIED' : 'FAIL'): Tier1Gate => ({ status, tier, value: 1, threshold: 1, unit: null, reason: '' });

assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(1), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_1');
assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(2), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_2');
assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(3), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_3');
assert.equal(classifyTier({ lom: gate(1), scale: gate(2), cost: gate(null), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_2');
assert.ok(classifyTier({ lom: gate(1), scale: gate(2), cost: gate(null), cycle: gate(1), capitalReturns: gate(1) }).reason.includes('provisoriska'));
assert.equal(classifyTier({ lom: gate(1), scale: gate(2), cost: gate(3), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_3');
assert.equal(classifyTier({ lom: gate(1), scale: gate(3), cost: gate(null), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_3');
assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(1), cycle: gate(null), capitalReturns: gate(1) }).status, 'NOT_VERIFIED');
assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(1), cycle: gate(1), capitalReturns: gate(null, 'FAIL') }).status, 'NOT_QUALIFIED');

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
