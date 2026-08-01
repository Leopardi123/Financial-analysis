import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runCorporateSnapshotPipeline } from '../../snapshot/runCorporateSnapshot.ts';
import { CORPORATE_METAL_PRICE_MULTIPLIERS } from '../sensitivity.ts';
import { buildCorporateSensitivityScenarioModel } from '../../../components/project/corporateSensitivityModel.ts';

const manualDeck = Object.fromEntries(Object.entries({ XAU_USD_TOZ: 2330, XAG_USD_TOZ: 26.8, CU_USD_LB: 4 }).map(([metalKey, value]) => [metalKey, { metalKey, displayName: metalKey, unit: null, value, enteredAtUtc: '2026-01-01T00:00:00Z', expiresAtUtc: '2099-01-01T00:00:00Z' }]));
async function baseBody(projectFiles?: string[]) {
  const body = JSON.parse(await readFile('scripts/fixtures/snapshot-requests/abra_minimal.json', 'utf8'));
  body.valuationYear = 2026; body.scenario = { mode: 'spot' }; body.manualMetalPrices = manualDeck;
  if (projectFiles) body.projects = await Promise.all(projectFiles.map(async (file) => {
    const rawJson = JSON.parse(await readFile(`src/lib/snapshot/__tests__/fixtures/${file}`, 'utf8'));
    rawJson.version = 'project_json_v2';
    rawJson.time.productionStartYear = Number(rawJson.time.periodEndDatesUtc[rawJson.time.productionStartPeriod].slice(0, 4));
    return { projectId: rawJson.meta.projectId, rawJson };
  }));
  for (const project of body.projects) {
    project.rawJson.version = 'project_json_v2';
    project.rawJson.time.productionStartYear ??= body.valuationYear + project.rawJson.time.productionStartPeriod;
  }
  return body;
}

test('seven full scenarios preserve spot parity, isolate inputs, and recalculate project economics', async () => {
  const body = await baseBody(['p5.los-ricos-north.project_json_v1.json', 'p6.los-ricos-south.project_json_v1.json']);
  const before = structuredClone(body);
  const pureSpot = await runCorporateSnapshotPipeline({ body: { ...structuredClone(body), scenario: { mode: 'spot' } }, refresh: false });
  assert.equal(pureSpot.ok, true);
  const results = await Promise.all(CORPORATE_METAL_PRICE_MULTIPLIERS.map((spotPriceMultiplier) => runCorporateSnapshotPipeline({ body: { ...structuredClone(body), scenario: { mode: 'spot', spotPriceMultiplier } }, refresh: false })));
  assert.ok(results.every((result) => result.ok));
  assert.deepEqual(body, before, 'base request must remain immutable');
  const spot = results[3];
  assert.equal(spot.ok, true); if (!spot.ok || !pureSpot.ok) return;
  for (const key of ['series', 'aggregation', 'canonicalValuationTimeline', 'corporateValuationTimeSeries', 'corporateQualityMultipleTimeSeries', 'financing']) assert.deepEqual((spot.snapshot as any)[key], (pureSpot.snapshot as any)[key], `1.00 parity: ${key}`);
  const low = results[0]; const high = results[6]; assert.equal(low.ok, true); assert.equal(high.ok, true); if (!low.ok || !high.ok) return;
  const resolvedSpotPriceByProject = Object.fromEntries(((pureSpot.snapshot as any).metalPriceSensitivityAudit.projects as Array<any>).map((project) => [project.projectId, project.resolvedPriceByKey]));
  const pinnedHigh = await runCorporateSnapshotPipeline({ body: { ...structuredClone(body), scenario: { mode: 'spot', spotPriceMultiplier: 1.25 }, resolvedSpotPriceByProject }, refresh: false });
  assert.equal(pinnedHigh.ok, true); if (!pinnedHigh.ok) return;
  for (const key of ['series', 'aggregation', 'canonicalValuationTimeline', 'corporateValuationTimeSeries', 'corporateQualityMultipleTimeSeries', 'financing']) assert.deepEqual((pinnedHigh.snapshot as any)[key], (high.snapshot as any)[key], `pinned spot parity: ${key}`);
  assert.equal(pinnedHigh.diagnostics.warnings.some((warning) => warning.startsWith('Spot resolver failed')), false, 'pinned scenarios must not call the live metal resolver');
  for (const [index, project] of (spot.snapshot as any).metalPriceSensitivityAudit.projects.entries()) {
    for (const [metal, price] of Object.entries(project.resolvedPriceByMetal) as Array<[string, number]>) {
      assert.equal((low.snapshot as any).metalPriceSensitivityAudit.projects[index].resolvedPriceByMetal[metal], price * 0.75);
      assert.equal((high.snapshot as any).metalPriceSensitivityAudit.projects[index].resolvedPriceByMetal[metal], price * 1.25);
    }
    assert.notEqual((low.snapshot as any).metalPriceSensitivityAudit.projects[index].revenueUSD, (high.snapshot as any).metalPriceSensitivityAudit.projects[index].revenueUSD);
    assert.notEqual((low.snapshot as any).metalPriceSensitivityAudit.projects[index].ebitdaUSD, (high.snapshot as any).metalPriceSensitivityAudit.projects[index].ebitdaUSD);
    assert.notEqual((low.snapshot as any).metalPriceSensitivityAudit.projects[index].fcffUSD, (high.snapshot as any).metalPriceSensitivityAudit.projects[index].fcffUSD);
  }
  assert.notDeepEqual((low.snapshot as any).aggregation.fcffUSD_total, (high.snapshot as any).aggregation.fcffUSD_total);
  assert.notEqual((low.snapshot as any).NPV_today_TargetCurrency, (high.snapshot as any).NPV_today_TargetCurrency);
});

test('real scenario outputs populate canonical-share table and same-scenario Combined', async () => {
  const body = await baseBody();
  const result = await runCorporateSnapshotPipeline({ body: { ...body, scenario: { mode: 'spot', spotPriceMultiplier: 1.25 } }, refresh: false });
  assert.equal(result.ok, true); if (!result.ok) return;
  const model = buildCorporateSensitivityScenarioModel({ snapshot: result.snapshot, multiplier: 1.25, diagnostics: result.diagnostics.warnings, extraShares: 1234 });
  assert.equal(model.column.multiplier, 1.25);
  assert.notEqual(model.column.values.navPerShare, 'Ej beräkningsbart');
  assert.notEqual(model.column.values.shares, 'Ej beräkningsbart');
  const qualityYear = model.quality!.rows.find((row) => row.qualityStatus === 'COMPUTABLE' && typeof row.annualEbitdaUSD === 'number' && row.annualEbitdaUSD > 0)!.calendarYear;
  const reference = model.timeline!.periods.find((row) => row.calendarYear === qualityYear)!;
  const combined = Number(model.column.values.combined.replace(/\s/g, '').replace(',', '.'));
  const qualityValue = Number(model.column.values.qualityValue.replace(/\s/g, '').replace(',', '.'));
  if (Number.isFinite(qualityValue)) assert.ok(Math.abs(combined - (0.7 * reference.navPerShareTarget! + 0.3 * qualityValue)) < 0.02);
});
