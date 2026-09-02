import assert from 'node:assert/strict';
import { VIZCACHITAS_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/vizcachitasPfs.ts';
import { BERG_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/bergPfs.ts';
import { WARINTZA_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/warintzaPfs.ts';
import { ARCTIC_FS_V3 } from '../../project/jsonv3/__tests__/fixtures/arcticFs.ts';
import { COPPER_CREEK_PEA_V3 } from '../../project/jsonv3/__tests__/fixtures/copperCreekPea.ts';
import type { ProjectJsonV3 } from '../../project/jsonv3/schema.ts';
import {
  TIER1_COST_NORMALIZATION_RECIPES,
  recipesForReportSource,
  runTier1CostNormalizationRecipes,
} from '../costNormalizationRecipe.ts';

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

async function assertNormalizedBatch(args: {
  name: string;
  raw: ProjectJsonV3;
  expectedRecipeIds: string[];
}): Promise<void> {
  const result = await runTier1CostNormalizationRecipes(args.raw);
  assert.equal(result.status, 'AVAILABLE', `${args.name}: ${result.reason} :: ${JSON.stringify(result.runs)}`);
  assert.deepEqual(result.runs.map((row) => row.recipeId), args.expectedRecipeIds);
  for (const run of result.runs) {
    assert.equal(run.normalized.status, 'NORMALIZED', `${args.name}/${run.recipeId}: ${JSON.stringify(run.normalized)}`);
    if (run.normalized.status !== 'NORMALIZED') continue;
    assert.equal(run.normalized.reportReconciliation.status, 'MATCHED');
    assert.ok(run.normalized.terms.length > 0);
    assert.ok(run.normalized.denominator.quantity > 0);
    assert.equal(run.benchmarkReadiness?.status, 'NOT_VERIFIED', `${args.name}/${run.recipeId} must remain fail-closed against external Cu benchmark.`);
  }
}

(async () => {
  assert.equal(TIER1_COST_NORMALIZATION_RECIPES.length, 10);
  assert.equal(recipesForReportSource('vizcachitas-pfs-2023').length, 2);
  assert.equal(recipesForReportSource('berg-pfs-2026').length, 2);
  assert.equal(recipesForReportSource('warintza-pfs-2025').length, 2);
  assert.equal(recipesForReportSource('arctic-fs-2023').length, 2);
  assert.equal(recipesForReportSource('copper-creek-pea-2023').length, 2);

  // Recipes are references/provenance only. Canonical dollar series remain in
  // Project JSON and are resolved at runtime; no parallel economic arrays/totals.
  const serialized = JSON.stringify(TIER1_COST_NORMALIZATION_RECIPES);
  assert.equal(serialized.includes('seriesUSD'), false);
  assert.equal(serialized.includes('valueUSD'), false);

  await assertNormalizedBatch({ name: 'Vizcachitas', raw: VIZCACHITAS_PFS_V3, expectedRecipeIds: ['vizcachitas-c1-first8', 'vizcachitas-c1-lom'] });
  await assertNormalizedBatch({ name: 'Berg', raw: BERG_PFS_V3, expectedRecipeIds: ['berg-c1-by-product-lom', 'berg-c1-cueq-co-product-lom'] });
  await assertNormalizedBatch({ name: 'Warintza', raw: WARINTZA_PFS_V3, expectedRecipeIds: ['warintza-c1-lom', 'warintza-aisc-lom'] });
  await assertNormalizedBatch({ name: 'Arctic', raw: ARCTIC_FS_V3, expectedRecipeIds: ['arctic-cash-cost-lom', 'arctic-all-in-cost-lom'] });
  await assertNormalizedBatch({ name: 'Copper Creek', raw: COPPER_CREEK_PEA_V3, expectedRecipeIds: ['copper-creek-cash-cost-lom', 'copper-creek-aisc-lom'] });

  const wrongSource = clone(VIZCACHITAS_PFS_V3);
  if (!wrongSource.verification?.report) throw new Error('Vizcachitas verification report required.');
  wrongSource.verification.report.sourceId = 'not-the-source';
  const wrongSourceResult = await runTier1CostNormalizationRecipes(wrongSource);
  assert.equal(wrongSourceResult.status, 'NOT_AVAILABLE');
  assert.equal(wrongSourceResult.runs.length, 0);

  const missingCanonicalRow = clone(VIZCACHITAS_PFS_V3);
  if (missingCanonicalRow.economics.costModel.mode !== 'COMPONENTS') throw new Error('Vizcachitas components required.');
  missingCanonicalRow.economics.costModel.components = missingCanonicalRow.economics.costModel.components.filter((row) => row.id !== 'mining_opex');
  const missingRowResult = await runTier1CostNormalizationRecipes(missingCanonicalRow);
  assert.equal(missingRowResult.status, 'NOT_VERIFIED');
  assert.ok(missingRowResult.runs.some((row) => row.normalized.status === 'NOT_VERIFIED'));

  console.log('costNormalizationRecipe.test.ts passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
