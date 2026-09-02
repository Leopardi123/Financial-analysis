// Active Tier policy regression wrapper. The historical broad test suite remains
// in tier1LegacySnapshot.test.ts; this file adds the 2026-09-02 Cost Quartile
// disablement contract on top of it.

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

// The active classifier must ignore cost unconditionally, not only when the
// inactive marker happens to be present in the cost-gate reason.
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

console.log('tier1 active Cost Quartile disabled regression passed');
