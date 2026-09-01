import assert from 'node:assert/strict';
import {
  TIER1_SCALE_THRESHOLDS,
  assessTier1ScaleProducts,
  getTier1ScaleThreshold,
  normalizeTier1ScaleQuantity,
} from '../scale.ts';

assert.equal(getTier1ScaleThreshold('Mo')?.minimumAnnualQuantity, 10_000);
assert.equal(getTier1ScaleThreshold('Mo')?.unit, 'tonne');
assert.equal(getTier1ScaleThreshold('Ni')?.minimumAnnualQuantity, 40_000);
assert.equal(getTier1ScaleThreshold('Zn')?.minimumAnnualQuantity, 150_000);

const exactThresholds = assessTier1ScaleProducts({
  Mo: { averageAnnualQuantity: 10_000, unit: 'tonne' },
  Ni: { averageAnnualQuantity: 40_000, unit: 'tonne' },
  Zn: { averageAnnualQuantity: 150_000, unit: 'tonne' },
});
assert.equal(exactThresholds.products.Mo.equivalent, 1);
assert.equal(exactThresholds.products.Ni.equivalent, 1);
assert.equal(exactThresholds.products.Zn.equivalent, 1);
assert.equal(exactThresholds.combinedEquivalent, 3);

const moInLb = assessTier1ScaleProducts({
  Mo: { averageAnnualQuantity: 10_000 * 2204.6226218487757, unit: 'lb' },
});
assert.ok(moInLb.products.Mo.normalizedQuantity !== null);
assert.ok(Math.abs((moInLb.products.Mo.normalizedQuantity as number) - 10_000) < 1e-9);
assert.ok(Math.abs((moInLb.products.Mo.equivalent as number) - 1) < 1e-12);

const unsupportedProductsRemainVisible = assessTier1ScaleProducts({
  Sn: { averageAnnualQuantity: 3_000, unit: 'tonne' },
  U3O8: { averageAnnualQuantity: 5_000_000, unit: 'lb' },
  WO3: { averageAnnualQuantity: 2_000, unit: 'tonne' },
});
assert.deepEqual(Object.keys(unsupportedProductsRemainVisible.products).sort(), ['Sn', 'U3O8', 'WO3']);
assert.equal(unsupportedProductsRemainVisible.products.Sn.scored, false);
assert.equal(unsupportedProductsRemainVisible.products.U3O8.scored, false);
assert.equal(unsupportedProductsRemainVisible.products.WO3.scored, false);
assert.equal(unsupportedProductsRemainVisible.combinedEquivalent, null);

assert.equal('U3O8' in TIER1_SCALE_THRESHOLDS, false);
assert.equal('U' in TIER1_SCALE_THRESHOLDS, false);
assert.equal('WO3' in TIER1_SCALE_THRESHOLDS, false);
assert.equal('W' in TIER1_SCALE_THRESHOLDS, false);

const productIdentityGuard = assessTier1ScaleProducts({
  U: { averageAnnualQuantity: 5_000_000, unit: 'lb' },
  U3O8: { averageAnnualQuantity: 5_000_000, unit: 'lb' },
  W: { averageAnnualQuantity: 2_000, unit: 'tonne' },
  WO3: { averageAnnualQuantity: 2_000, unit: 'tonne' },
});
assert.equal(productIdentityGuard.products.U.equivalent, null);
assert.equal(productIdentityGuard.products.U3O8.equivalent, null);
assert.equal(productIdentityGuard.products.W.equivalent, null);
assert.equal(productIdentityGuard.products.WO3.equivalent, null);

assert.equal(normalizeTier1ScaleQuantity({ product: 'Mo', value: 1, fromUnit: 'toz', toUnit: 'tonne' }), null);

console.log('scale.test.ts passed');
