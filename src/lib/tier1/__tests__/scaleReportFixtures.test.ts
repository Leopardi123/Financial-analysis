import assert from 'node:assert/strict';
import type { ProjectJsonV3 } from '../../project/jsonv3/schema.ts';
import { BERG_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/bergPfs.ts';
import { WARINTZA_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/warintzaPfs.ts';
import { VIZCACHITAS_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/vizcachitasPfs.ts';
import { COPPER_CREEK_PEA_V3 } from '../../project/jsonv3/__tests__/fixtures/copperCreekPea.ts';
import { ARCTIC_FS_V3 } from '../../project/jsonv3/__tests__/fixtures/arcticFs.ts';
import {
  bestSustainedTier1ScaleWindow,
  normalizeDiscoveredScaleQuantity,
  type Tier1ScaleWindow,
} from '../scale.ts';

function scaleWindowForReportFixture(raw: ProjectJsonV3): Tier1ScaleWindow {
  const quantityByProductByYear = new Map<string, Map<number, number>>();
  const unitByProduct = new Map<string, string>();
  const productionYears = new Set<number>();

  for (const [product, series] of Object.entries(raw.metals.payableQtyByMetal)) {
    const sourceUnit = raw.metals.payableQtyUnitByMetal[product];
    assert.ok(sourceUnit, `${raw.meta?.projectName ?? raw.meta?.projectId}: missing payable unit for ${product}`);

    for (let t = 0; t < series.length; t += 1) {
      const quantity = series[t];
      if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) continue;
      const normalized = normalizeDiscoveredScaleQuantity({ product, value: quantity, unit: sourceUnit });
      assert.ok(normalized, `${raw.meta?.projectName ?? raw.meta?.projectId}: ${product} ${sourceUnit} must be dimensionally normalizable`);

      const existingUnit = unitByProduct.get(product);
      assert.ok(!existingUnit || existingUnit === normalized.unit, `${raw.meta?.projectName ?? raw.meta?.projectId}: inconsistent normalized unit for ${product}`);
      unitByProduct.set(product, normalized.unit);

      const byPeriod = quantityByProductByYear.get(product) ?? new Map<number, number>();
      byPeriod.set(t, (byPeriod.get(t) ?? 0) + normalized.value);
      quantityByProductByYear.set(product, byPeriod);
      productionYears.add(t);
    }
  }

  return bestSustainedTier1ScaleWindow({
    quantityByProductByYear,
    unitByProduct,
    productionYears,
    sustainedScaleYears: 10,
  });
}

const moGoldenCases: Array<{
  fixture: ProjectJsonV3;
  combinedEquivalent: number;
  moEquivalent: number;
}> = [
  { fixture: VIZCACHITAS_PFS_V3, combinedEquivalent: 2.306319333333333, moEquivalent: 0.4976 },
  { fixture: BERG_PFS_V3, combinedEquivalent: 2.2377290042566664, moEquivalent: 0.9797595192 },
  { fixture: WARINTZA_PFS_V3, combinedEquivalent: 3.1626266666666667, moEquivalent: 0.958 },
  { fixture: COPPER_CREEK_PEA_V3, combinedEquivalent: 0.62396115129, moEquivalent: 0.09344002822 },
];

for (const expected of moGoldenCases) {
  const scale = scaleWindowForReportFixture(expected.fixture);
  const projectName = expected.fixture.meta?.projectName ?? expected.fixture.meta?.projectId ?? 'project';
  const mo = scale.products.Mo;

  assert.ok(mo, `${projectName}: Mo must remain visible in the selected sustained scale window`);
  assert.equal(mo.scored, true, `${projectName}: accepted Mo=10 kt/year policy must be scored`);
  assert.equal(mo.threshold, 10_000, `${projectName}: Mo threshold must remain 10 kt/year`);
  assert.equal(mo.thresholdUnit, 'tonne');
  assert.ok(typeof mo.equivalent === 'number' && Math.abs(mo.equivalent - expected.moEquivalent) < 1e-10, `${projectName}: payable Mo scale contribution changed unexpectedly`);
  assert.ok(typeof scale.combinedEquivalent === 'number' && Math.abs(scale.combinedEquivalent - expected.combinedEquivalent) < 1e-10, `${projectName}: combined scale changed unexpectedly`);
}

const bergScale = scaleWindowForReportFixture(BERG_PFS_V3);
assert.equal(bergScale.products.Mo.inputUnit, 'tonne', 'Berg lb payable Mo is normalized to tonnes before the sustained window is scored');
assert.ok((bergScale.products.Mo.normalizedQuantity ?? 0) > 0);

const arcticScale = scaleWindowForReportFixture(ARCTIC_FS_V3);
assert.ok(arcticScale.products.Zn, 'Arctic: Zn must remain visible');
assert.equal(arcticScale.products.Zn.scored, true);
assert.equal(arcticScale.products.Zn.threshold, 150_000);
assert.equal(arcticScale.products.Zn.thresholdUnit, 'tonne');
assert.ok(typeof arcticScale.products.Zn.equivalent === 'number' && Math.abs(arcticScale.products.Zn.equivalent - 0.5426818426018734) < 1e-10);
assert.ok(typeof arcticScale.combinedEquivalent === 'number' && Math.abs(arcticScale.combinedEquivalent - 1.6430524341015067) < 1e-10);

for (const fixture of [VIZCACHITAS_PFS_V3, BERG_PFS_V3, WARINTZA_PFS_V3, COPPER_CREEK_PEA_V3, ARCTIC_FS_V3]) {
  const scale = scaleWindowForReportFixture(fixture);
  const scoredSum = Object.values(scale.products)
    .filter((row) => row.scored && typeof row.equivalent === 'number' && Number.isFinite(row.equivalent))
    .reduce((sum, row) => sum + (row.equivalent as number), 0);
  assert.ok(typeof scale.combinedEquivalent === 'number');
  assert.ok(Math.abs((scale.combinedEquivalent as number) - scoredSum) < 1e-12, `${fixture.meta?.projectName}: combined scale must equal the exact sum of scored physical products`);
}

console.log('scaleReportFixtures.test.ts passed');
