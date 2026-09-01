import './costDefinitionContract.test.ts';
import assert from 'node:assert/strict';
import type { ProjectJsonV3CostComponent } from '../../project/jsonv3/schema.ts';
import { allocateTier1CoProductCost } from '../costAllocation.ts';

const components: ProjectJsonV3CostComponent[] = [
  {
    id: 'mixed-site-cost',
    category: 'processing',
    seriesUSD: [100, 200],
    allocation: { mode: 'MIXED_REVENUE_WEIGHTED' },
  },
  {
    id: 'direct-cu-cost',
    category: 'mining',
    seriesUSD: [20, 40],
    allocation: { mode: 'DIRECT_TO_METAL', metal: 'Cu' },
  },
];

const base = allocateTier1CoProductCost({
  components,
  allocationRevenueUSDByProduct: {
    Cu: [60, 120],
    Au: [40, 80],
  },
});
assert.equal(base.status, 'COMPUTABLE');
if (base.status === 'COMPUTABLE') {
  assert.deepEqual(base.sourceCostUSD, [120, 240]);
  assert.deepEqual(base.allocatedCostUSD, [120, 240]);
  assert.deepEqual(base.allocatedCostUSDByProduct.Cu, [80, 160]);
  assert.deepEqual(base.allocatedCostUSDByProduct.Au, [40, 80]);
  assert.equal(base.trace[0].mode, 'MIXED_REVENUE_WEIGHTED');
  assert.deepEqual(base.trace[0].allocatedCostUSDByProduct.Cu, [60, 120]);
  assert.deepEqual(base.trace[0].allocatedCostUSDByProduct.Au, [40, 80]);
  assert.equal(base.trace[1].mode, 'DIRECT_TO_METAL');
  assert.deepEqual(base.trace[1].allocatedCostUSDByProduct.Cu, [20, 40]);
  assert.deepEqual(base.trace[1].allocatedCostUSDByProduct.Au, [0, 0]);
}

const changedRevenueWeights = allocateTier1CoProductCost({
  components,
  allocationRevenueUSDByProduct: {
    Cu: [30, 60],
    Au: [70, 140],
  },
});
assert.equal(changedRevenueWeights.status, 'COMPUTABLE');
if (changedRevenueWeights.status === 'COMPUTABLE') {
  assert.deepEqual(changedRevenueWeights.sourceCostUSD, [120, 240], 'allocation revenue must not mutate the canonical source-cost pool');
  assert.deepEqual(changedRevenueWeights.allocatedCostUSD, [120, 240], 'allocation must conserve the source-cost pool');
  assert.deepEqual(changedRevenueWeights.allocatedCostUSDByProduct.Cu, [50, 100]);
  assert.deepEqual(changedRevenueWeights.allocatedCostUSDByProduct.Au, [70, 140]);
}

const missingAllocation = allocateTier1CoProductCost({
  components: [{ id: 'unknown', category: 'processing', seriesUSD: [100] }],
  allocationRevenueUSDByProduct: { Cu: [100] },
});
assert.equal(missingAllocation.status, 'NOT_VERIFIED');
assert.ok(missingAllocation.status === 'NOT_VERIFIED' && missingAllocation.reason.includes('saknar explicit allocation metadata'));

const invalidDirectProduct = allocateTier1CoProductCost({
  components: [{
    id: 'direct-mo',
    category: 'processing',
    seriesUSD: [100],
    allocation: { mode: 'DIRECT_TO_METAL', metal: 'Mo' },
  }],
  allocationRevenueUSDByProduct: { Cu: [100] },
});
assert.equal(invalidDirectProduct.status, 'NOT_VERIFIED');
assert.ok(invalidDirectProduct.status === 'NOT_VERIFIED' && invalidDirectProduct.reason.includes('saknas i allocation revenue vector'));

const zeroRevenueWithMixedCost = allocateTier1CoProductCost({
  components: [{
    id: 'mixed',
    category: 'processing',
    seriesUSD: [100],
    allocation: { mode: 'MIXED_REVENUE_WEIGHTED' },
  }],
  allocationRevenueUSDByProduct: { Cu: [0], Au: [0] },
});
assert.equal(zeroRevenueWithMixedCost.status, 'NOT_VERIFIED');

console.log('costAllocation.test.ts passed');
