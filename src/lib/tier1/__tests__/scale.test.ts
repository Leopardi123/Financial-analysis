import './scaleReportFixtures.test.ts';
import assert from 'node:assert/strict';
import {
  TIER1_SCALE_THRESHOLDS,
  assessTier1ScaleProducts,
  bestSustainedTier1ScaleWindow,
  getTier1ScaleThreshold,
  normalizeDiscoveredScaleQuantity,
  normalizeTier1ScaleQuantity,
} from '../scale.ts';

assert.equal(getTier1ScaleThreshold('Mo')?.minimumAnnualQuantity, 10_000);
assert.equal(getTier1ScaleThreshold('Mo')?.unit, 'tonne');
assert.equal(getTier1ScaleThreshold('Ni')?.minimumAnnualQuantity, 40_000);
assert.equal(getTier1ScaleThreshold('Zn')?.minimumAnnualQuantity, 150_000);
assert.equal(getTier1ScaleThreshold('U3O8')?.minimumAnnualQuantity, 5_000_000);
assert.equal(getTier1ScaleThreshold('U3O8')?.unit, 'lb');
assert.equal(getTier1ScaleThreshold('WO3')?.minimumAnnualQuantity, 2_000);
assert.equal(getTier1ScaleThreshold('WO3')?.unit, 'tonne');

const exactThresholds = assessTier1ScaleProducts({
  Mo: { averageAnnualQuantity: 10_000, unit: 'tonne' },
  Ni: { averageAnnualQuantity: 40_000, unit: 'tonne' },
  Zn: { averageAnnualQuantity: 150_000, unit: 'tonne' },
  U3O8: { averageAnnualQuantity: 5_000_000, unit: 'lb' },
  WO3: { averageAnnualQuantity: 2_000, unit: 'tonne' },
});
assert.equal(exactThresholds.products.Mo.equivalent, 1);
assert.equal(exactThresholds.products.Ni.equivalent, 1);
assert.equal(exactThresholds.products.Zn.equivalent, 1);
assert.equal(exactThresholds.products.U3O8.equivalent, 1);
assert.equal(exactThresholds.products.WO3.equivalent, 1);
assert.equal(exactThresholds.combinedEquivalent, 5);

const moInLb = assessTier1ScaleProducts({
  Mo: { averageAnnualQuantity: 10_000 * 2204.6226218487757, unit: 'lb' },
});
assert.ok(moInLb.products.Mo.normalizedQuantity !== null);
assert.ok(Math.abs((moInLb.products.Mo.normalizedQuantity as number) - 10_000) < 1e-9);
assert.ok(Math.abs((moInLb.products.Mo.equivalent as number) - 1) < 1e-12);

const normalizedMoDiscovery = normalizeDiscoveredScaleQuantity({
  product: 'Mo', value: 22_046_226.218487758, unit: 'lb',
});
assert.ok(normalizedMoDiscovery);
assert.equal(normalizedMoDiscovery?.unit, 'tonne');
assert.ok(Math.abs((normalizedMoDiscovery?.value ?? 0) - 10_000) < 1e-9);

const normalizedU3O8Discovery = normalizeDiscoveredScaleQuantity({
  product: 'U3O8', value: 5_000_000, unit: 'lb',
});
assert.ok(normalizedU3O8Discovery);
assert.equal(normalizedU3O8Discovery?.unit, 'tonne');
const u3o8FromDiscovery = assessTier1ScaleProducts({
  U3O8: {
    averageAnnualQuantity: normalizedU3O8Discovery?.value ?? 0,
    unit: normalizedU3O8Discovery?.unit ?? 'tonne',
  },
});
assert.ok(Math.abs((u3o8FromDiscovery.products.U3O8.equivalent ?? 0) - 1) < 1e-12);

const unsupportedProductsRemainVisible = assessTier1ScaleProducts({
  Sn: { averageAnnualQuantity: 3_000, unit: 'tonne' },
});
assert.deepEqual(Object.keys(unsupportedProductsRemainVisible.products), ['Sn']);
assert.equal(unsupportedProductsRemainVisible.products.Sn.scored, false);
assert.equal(unsupportedProductsRemainVisible.combinedEquivalent, null);

assert.equal('U3O8' in TIER1_SCALE_THRESHOLDS, true);
assert.equal('U' in TIER1_SCALE_THRESHOLDS, false);
assert.equal('WO3' in TIER1_SCALE_THRESHOLDS, true);
assert.equal('W' in TIER1_SCALE_THRESHOLDS, false);

const productIdentityGuard = assessTier1ScaleProducts({
  U: { averageAnnualQuantity: 5_000_000, unit: 'lb' },
  U3O8: { averageAnnualQuantity: 5_000_000, unit: 'lb' },
  W: { averageAnnualQuantity: 2_000, unit: 'tonne' },
  WO3: { averageAnnualQuantity: 2_000, unit: 'tonne' },
});
assert.equal(productIdentityGuard.products.U.equivalent, null);
assert.equal(productIdentityGuard.products.U.scored, false);
assert.equal(productIdentityGuard.products.U3O8.equivalent, 1);
assert.equal(productIdentityGuard.products.U3O8.scored, true);
assert.equal(productIdentityGuard.products.W.equivalent, null);
assert.equal(productIdentityGuard.products.W.scored, false);
assert.equal(productIdentityGuard.products.WO3.equivalent, 1);
assert.equal(productIdentityGuard.products.WO3.scored, true);
assert.equal(productIdentityGuard.combinedEquivalent, 2);

const quantityByProductByYear = new Map<string, Map<number, number>>([
  ['Cu', new Map(Array.from({ length: 12 }, (_, index) => [2030 + index, index < 2 ? 20_000 : 60_000]))],
  ['Mo', new Map(Array.from({ length: 12 }, (_, index) => [2030 + index, index < 2 ? 2_000 : 5_000]))],
  ['Sn', new Map(Array.from({ length: 12 }, (_, index) => [2030 + index, 3_000]))],
]);
const sustainedWindow = bestSustainedTier1ScaleWindow({
  quantityByProductByYear,
  unitByProduct: new Map([['Cu', 'tonne'], ['Mo', 'tonne'], ['Sn', 'tonne']]),
  productionYears: new Set(Array.from({ length: 12 }, (_, index) => 2030 + index)),
  sustainedScaleYears: 10,
});
assert.equal(sustainedWindow.startYear, 2032);
assert.equal(sustainedWindow.endYear, 2041);
assert.equal(sustainedWindow.products.Cu.equivalent, 0.6);
assert.equal(sustainedWindow.products.Mo.equivalent, 0.5);
assert.equal(sustainedWindow.products.Sn.scored, false);
assert.ok(Math.abs((sustainedWindow.combinedEquivalent ?? 0) - 1.1) < 1e-12);

assert.equal(normalizeTier1ScaleQuantity({ product: 'Mo', value: 1, fromUnit: 'toz', toUnit: 'tonne' }), null);
assert.equal(normalizeTier1ScaleQuantity({ product: 'U', value: 1, fromUnit: 'lb', toUnit: 'lb' }), 1);
assert.equal(normalizeTier1ScaleQuantity({ product: 'W', value: 1, fromUnit: 'tonne', toUnit: 'tonne' }), 1);

console.log('scale.test.ts passed');
