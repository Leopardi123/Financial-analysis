import assert from 'node:assert/strict';
import { computeTier1CycleMultiplier } from '../cycle.ts';
import { getTier1CostBenchmarkTodos } from '../config.ts';
import { assessCapitalReturns, assessCombinedScale, assessLom, classifyTier, type Tier1Gate } from '../preRevenue.ts';
import { selectConservativeProjectIrr } from '../projectIrr.ts';
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

// ABRA-like best sustained 10y window (2030–2039): ~11.13 Moz Ag/y + ~75.4 koz Au/y.
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

// Multi-project Tier uses the lowest valid IRR among projects that actually
// contain investment cash-flow. A positive-only project has no investment IRR
// and must not turn the company into NOT_VERIFIED.
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

const gate = (tier: 1 | 2 | 3 | null, status: Tier1Gate['status'] = tier === 1 ? 'PASS' : tier === null ? 'NOT_VERIFIED' : 'FAIL'): Tier1Gate => ({
  status, tier, value: 1, threshold: 1, unit: null, reason: '',
});

assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(1), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_1');
assert.equal(classifyTier({ lom: gate(1), scale: gate(2), cost: gate(null), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_2');
assert.equal(classifyTier({ lom: gate(1), scale: gate(3), cost: gate(null), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_3');
assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(1), cycle: gate(null), capitalReturns: gate(1) }).status, 'NOT_VERIFIED');
assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(1), cycle: gate(1), capitalReturns: gate(null, 'FAIL') }).status, 'NOT_QUALIFIED');

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
const staleTodos = getTier1CostBenchmarkTodos('2027-08-27T00:00:00Z');
assert.equal(staleTodos.length, 8);
assert.ok(staleTodos.every((todo) => todo.includes('uppdatera statisk Q1-kostnadsreferens')));

console.log('tier1.test.ts passed');
