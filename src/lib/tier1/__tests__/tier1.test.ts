import assert from 'node:assert/strict';
import { computeTier1CycleMultiplier } from '../cycle.ts';
import { getTier1CostBenchmarkTodos } from '../config.ts';
import { assessCapitalReturns, assessLom, assessScale, combineTier1GateStatuses } from '../preRevenue.ts';

function monthDate(index: number): string {
  const date = new Date(Date.UTC(2000 + Math.floor(index / 12), index % 12, 28));
  return date.toISOString().slice(0, 10);
}

const history = Array.from({ length: 300 }, (_, index) => {
  const cycle = index % 60;
  const regime = cycle >= 42 && cycle <= 53 ? 0.68 : cycle >= 30 && cycle < 42 ? 0.82 : 1;
  const trend = 100 + index * 0.25;
  return { date: monthDate(index), close: trend * regime };
});

const cycle = computeTier1CycleMultiplier(history);
assert.equal(cycle.status, 'COMPUTABLE');
assert.ok(cycle.multiplier !== null && cycle.multiplier > 0 && cycle.multiplier < 1);
assert.ok(cycle.monthlyObservations >= 299);

assert.equal(assessLom(15).status, 'PASS');
assert.equal(assessLom(14).status, 'FAIL');
assert.equal(assessScale({ primaryMetal: 'Au', averageAnnualPayable: 300_000 }).status, 'PASS');
assert.equal(assessScale({ primaryMetal: 'Cu', averageAnnualPayable: 99_999 }).status, 'FAIL');
assert.equal(assessCapitalReturns(0.25).status, 'PASS');
assert.equal(assessCapitalReturns(0.2499).status, 'FAIL');

const passGate = { status: 'PASS' as const, value: 1, threshold: 1, unit: null, reason: '' };
const failGate = { ...passGate, status: 'FAIL' as const };
const unknownGate = { ...passGate, status: 'NOT_VERIFIED' as const };
assert.equal(combineTier1GateStatuses({ lom: passGate, scale: passGate, cost: passGate, cycle: passGate, capitalReturns: passGate }), 'TIER_1');
assert.equal(combineTier1GateStatuses({ lom: passGate, scale: failGate, cost: passGate, cycle: passGate, capitalReturns: passGate }), 'NOT_TIER_1');
assert.equal(combineTier1GateStatuses({ lom: passGate, scale: passGate, cost: unknownGate, cycle: passGate, capitalReturns: passGate }), 'NOT_VERIFIED');

assert.equal(getTier1CostBenchmarkTodos('2027-02-28T00:00:00Z').length, 0);
assert.deepEqual(getTier1CostBenchmarkTodos('2027-03-01T00:00:00Z'), [
  'Tier-1: uppdatera statisk Q1-kostnadsgräns för Au (senast 2026-03-01).',
]);

console.log('tier1.test.ts passed');
