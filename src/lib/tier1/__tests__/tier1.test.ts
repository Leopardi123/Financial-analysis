// Active Tier policy regression wrapper. The historical broad test suite remains
// in tier1LegacySnapshot.test.ts; this file adds the 2026-09-02 Cost Quartile
// disablement contract and active cycle-ceiling contract on top of it.

import './cycleExactPolicyAudit.test.ts';
import './tier1LegacySnapshot.test.ts';
import assert from 'node:assert/strict';
import { assessCost, classifyTier, TIER1_COST_QUARTILE_INACTIVE_REASON, type Tier1Gate } from '../preRevenue.ts';
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
assert.equal(arbitraryLegacyTier3Cost.status, 'NOT_VERIFIED');
assert.equal(arbitraryLegacyTier3Cost.tier, null);
assert.equal(arbitraryLegacyTier3Cost.reason, TIER1_COST_QUARTILE_INACTIVE_REASON);

const secondLegacyTier3Cost = gate(3);
assert.equal(classifyTier({
  lom: gate(1), scale: gate(2), cost: secondLegacyTier3Cost, cycle: gate(1), capitalReturns: gate(1),
}).status, 'TIER_2');
assert.equal(secondLegacyTier3Cost.reason, TIER1_COST_QUARTILE_INACTIVE_REASON);

// Active cycle policy is a structural Tier ceiling set by 5y normalized beta.
// The 7y survival NPV10 is diagnostic only; a negative survival observation must
// not convert a verified beta result into NOT_QUALIFIED.
assert.equal(classifyTier({
  lom: gate(1), scale: gate(1), cost: inactiveCost, cycle: gate(2, 'PASS'), capitalReturns: gate(1),
}).status, 'TIER_2');
assert.equal(classifyTier({
  lom: gate(1), scale: gate(1), cost: inactiveCost, cycle: gate(3, 'PASS'), capitalReturns: gate(1),
}).status, 'TIER_3');
assert.equal(classifyTier({
  lom: gate(1), scale: gate(1), cost: inactiveCost, cycle: gate(3, 'FAIL'), capitalReturns: gate(1),
}).status, 'TIER_3');
assert.equal(classifyTier({
  lom: gate(1), scale: gate(1), cost: inactiveCost, cycle: gate(null, 'FAIL'), capitalReturns: gate(1),
}).status, 'NOT_VERIFIED');

console.log('tier1 active Cost Quartile disabled + cycle ceiling regressions passed');
