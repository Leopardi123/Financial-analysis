import assert from 'node:assert/strict';
import { computeTier1CycleMultiplier } from '../cycle.ts';
import { getTier1CostBenchmarkTodos } from '../config.ts';
import { assessCapitalReturns, assessCombinedScale, assessLom, classifyTier, type Tier1Gate } from '../preRevenue.ts';

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

assert.equal(assessLom(15).tier, 1);
assert.equal(assessLom(14).tier, 2);
assert.equal(assessLom(9).tier, 3);

const abraLikeScale = assessCombinedScale({ Ag: 5_838_160, Au: 61_443 });
assert.equal(abraLikeScale.gate.tier, 2);
assert.ok(abraLikeScale.combinedEquivalent !== null && abraLikeScale.combinedEquivalent > 0.59 && abraLikeScale.combinedEquivalent < 0.60);

const verySmallScale = assessCombinedScale({ Au: 60_000 });
assert.equal(verySmallScale.gate.tier, 3);

const polymetallicPass = assessCombinedScale({ Cu: 60_000, Au: 120_000 });
assert.equal(polymetallicPass.gate.tier, 1);
assert.equal(polymetallicPass.combinedEquivalent, 1);

assert.equal(assessCapitalReturns(0.25).tier, 1);
assert.equal(assessCapitalReturns(0.22).tier, 2);
assert.equal(assessCapitalReturns(0.17).tier, 3);
assert.equal(assessCapitalReturns(0.14).tier, null);

const gate = (tier: 1 | 2 | 3 | null, status: Tier1Gate['status'] = tier === 1 ? 'PASS' : tier === null ? 'NOT_VERIFIED' : 'FAIL'): Tier1Gate => ({
  status, tier, value: 1, threshold: 1, unit: null, reason: '',
});

assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(1), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_1');
assert.equal(classifyTier({ lom: gate(1), scale: gate(2), cost: gate(null), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_2');
assert.equal(classifyTier({ lom: gate(1), scale: gate(3), cost: gate(null), cycle: gate(1), capitalReturns: gate(1) }).status, 'TIER_3');
assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(1), cycle: gate(null), capitalReturns: gate(1) }).status, 'NOT_VERIFIED');
assert.equal(classifyTier({ lom: gate(1), scale: gate(1), cost: gate(1), cycle: gate(1), capitalReturns: gate(null, 'FAIL') }).status, 'NOT_QUALIFIED');

assert.equal(getTier1CostBenchmarkTodos('2027-08-26T00:00:00Z').length, 0);
const staleTodos = getTier1CostBenchmarkTodos('2027-08-27T00:00:00Z');
assert.equal(staleTodos.length, 8);
assert.ok(staleTodos.every((todo) => todo.includes('uppdatera statisk Q1-kostnadsreferens')));

console.log('tier1.test.ts passed');
