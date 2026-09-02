import assert from 'node:assert/strict';
import { BERG_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/bergPfs.ts';
import { WARINTZA_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/warintzaPfs.ts';
import { runTier1CostNormalizationRecipes } from '../costNormalizationRecipe.ts';
import { reconstructSourceLockedCuCoProductC1 } from '../costCoProductReconstruction.ts';

const bergBatch = await runTier1CostNormalizationRecipes(BERG_PFS_V3);
const bergRun = bergBatch.runs.find((row) => row.recipeId === 'berg-c1-by-product-lom');
assert.ok(bergRun);
if (!bergRun) throw new Error('Berg by-product recipe missing');
const berg = await reconstructSourceLockedCuCoProductC1({ raw: BERG_PFS_V3, recipeId: bergRun.recipeId, normalized: bergRun.normalized });
assert.equal(berg.status, 'RECONSTRUCTED');
if (berg.status === 'RECONSTRUCTED') {
  assert.equal(berg.metric, 'C1_CU_USD_PER_LB');
  assert.equal(berg.allocationRevenueBasis, 'PUBLISHED_PRODUCT_NET_REVENUE_TABLE_22_4');
  assert.ok(Math.abs(berg.value - 1.9233627515309155) < 1e-10, `Berg runtime net-revenue diagnostic changed: ${berg.value}`);
  assert.ok(Math.abs(berg.sourceValue - (-0.1585)) < 0.02);
  assert.ok(Math.abs(berg.sourcePoolUSD - berg.allocatedCuCostUSD) > 1, 'Cu should receive only its co-product share of Berg common pool.');
  assert.ok(berg.limitations.some((x) => x.includes('S&P 2024')));
}

const warintzaBatch = await runTier1CostNormalizationRecipes(WARINTZA_PFS_V3);
const warintzaRun = warintzaBatch.runs.find((row) => row.recipeId === 'warintza-c1-lom');
assert.ok(warintzaRun);
if (!warintzaRun) throw new Error('Warintza C1 recipe missing');
const warintza = await reconstructSourceLockedCuCoProductC1({ raw: WARINTZA_PFS_V3, recipeId: warintzaRun.recipeId, normalized: warintzaRun.normalized });
assert.equal(warintza.status, 'RECONSTRUCTED');
if (warintza.status === 'RECONSTRUCTED') {
  assert.equal(warintza.metric, 'C1_CU_USD_PER_LB');
  assert.equal(warintza.allocationRevenueBasis, 'REPORT_DECK_RETAINED_PRODUCT_REVENUE_WITH_STREAM_PURCHASE');
  assert.ok(warintza.value > 1.79 && warintza.value < 1.83, `Warintza report-deck co-product diagnostic expected ~1.81 USD/lb, got ${warintza.value}`);
  assert.ok(Math.abs(warintza.sourceValue - 1.0114) < 0.02);
  assert.ok(warintza.allocationProducts.includes('Au'));
  assert.ok(warintza.limitations.some((x) => x.includes('stream')));
  assert.equal(warintza.costBaseYear, null);
}

const warintzaAiscRun = warintzaBatch.runs.find((row) => row.recipeId === 'warintza-aisc-lom');
assert.ok(warintzaAiscRun);
if (!warintzaAiscRun) throw new Error('Warintza AISC recipe missing');
const warintzaAisc = await reconstructSourceLockedCuCoProductC1({ raw: WARINTZA_PFS_V3, recipeId: warintzaAiscRun.recipeId, normalized: warintzaAiscRun.normalized });
assert.equal(warintzaAisc.status, 'NOT_AVAILABLE');
assert.ok(warintzaAisc.reason.includes('inte C1 cash cost'));

console.log('costCoProductReconstruction.test.ts passed');
