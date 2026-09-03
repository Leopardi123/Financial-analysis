// Active Tier policy regression wrapper. The historical broad test suite remains
// in tier1LegacySnapshot.test.ts; this file adds the 2026-09-02 Cost Quartile
// disablement contract and active cycle-ceiling contract on top of it.

import './cycleExactPolicyAudit.test.ts';
import './tier1LegacySnapshot.test.ts';
import assert from 'node:assert/strict';
import { assessCost, classifyTier, TIER1_COST_QUARTILE_INACTIVE_REASON, type Tier1Gate } from '../preRevenue.ts';
import { assessForwardCapitalEfficiency, computeForwardCapitalEfficiency } from '../forwardCapitalEfficiency.ts';

const fce = computeForwardCapitalEfficiency({ fcffUSD: [50, 80, 70], futureCapitalUSD: [100, 20, 10], discountRate: 0.10 });
assert.equal(typeof fce.value, 'number');
assert.equal(typeof fce.futureCapitalPvUSD, 'number');
assert.equal(assessForwardCapitalEfficiency(0.70).tier, 1);
assert.equal(assessForwardCapitalEfficiency(0.50).tier, 2);
assert.equal(assessForwardCapitalEfficiency(0.25).tier, 3);
assert.equal(assessForwardCapitalEfficiency(0.249).tier, null);
assert.equal(computeForwardCapitalEfficiency({ fcffUSD: [1], futureCapitalUSD: [0], discountRate: 0.10 }).value, null);
assert.equal(computeForwardCapitalEfficiency({ fcffUSD: [1], futureCapitalUSD: [-1], discountRate: 0.10 }).value, null);

const inactiveCost = assessCost({
  primaryMetal: 'Cu',
  primaryMetalRevenueShare: 1,
  costMetricValues: { C1_CU_USD_PER_LB: 0.01 },
  nowUtc: '2026-09-02T00:00:00Z',
});
assert.equal(inactiveCost.status, 'NOT_VERIFIED');
assert.equal(inactiveCost.tier, null);
assert.equal(inactiveCost.value, null);
assert.equal(inactiveCost.reason, TIER1_COST_QUARTILE_INACTIVE_REASON);
assert.ok(inactiveCost.reason.includes('N/A'));

const gate = (tier: 1 | 2 | 3 | null, status: Tier1Gate['status'] = tier === 1 ? 'PASS' : tier === null ? 'NOT_VERIFIED' : 'FAIL'): Tier1Gate => ({
  status, tier, value: 1, threshold: 1, unit: null, reason: '',
});

const tier1WithoutCost = classifyTier({
  lom: gate(1), scale: gate(1), cost: inactiveCost, cycle: gate(1), capitalReturns: gate(1),
});
assert.equal(tier1WithoutCost.status, 'TIER_1');
assert.ok(tier1WithoutCost.reason.includes('Cost Quartile är N/A'));

const tier2WithoutCost = classifyTier({
  lom: gate(1), scale: gate(2), cost: inactiveCost, cycle: gate(1), capitalReturns: gate(1),
});
assert.equal(tier2WithoutCost.status, 'TIER_2');
assert.ok(!tier2WithoutCost.reason.toLowerCase().includes('provisor'));

const arbitraryLegacyTier3Cost = gate(3);
assert.equal(classifyTier({
  lom: gate(1), scale: gate(1), cost: arbitraryLegacyTier3Cost, cycle: gate(1), capitalReturns: gate(1),
}).status, 'TIER_1');
assert.equal(classifyTier({
  lom: gate(1), scale: gate(2), cost: arbitraryLegacyTier3Cost, cycle: gate(1), capitalReturns: gate(1),
}).status, 'TIER_2');

const tier3CostMustNotLowerTier1 = classifyTier({
  lom: gate(1), scale: gate(1),
  cost: { ...inactiveCost, tier: 3, status: 'FAIL' },
  cycle: gate(1), capitalReturns: gate(1),
});
assert.equal(tier3CostMustNotLowerTier1.status, 'TIER_1');

// Active cycle policy is a structural Tier ceiling. T2/T3 cycle outcomes are
// valid surviving projects (PASS), while only the 7y survival failure disqualifies.
assert.equal(classifyTier({
  lom: gate(1), scale: gate(1), cost: inactiveCost, cycle: gate(2, 'PASS'), capitalReturns: gate(1),
}).status, 'TIER_2');
assert.equal(classifyTier({
  lom: gate(1), scale: gate(1), cost: inactiveCost, cycle: gate(3, 'PASS'), capitalReturns: gate(1),
}).status, 'TIER_3');
assert.equal(classifyTier({
  lom: gate(1), scale: gate(1), cost: inactiveCost, cycle: gate(null, 'FAIL'), capitalReturns: gate(1),
}).status, 'NOT_QUALIFIED');

console.log('tier1 active Cost Quartile disabled + cycle ceiling regressions passed');
