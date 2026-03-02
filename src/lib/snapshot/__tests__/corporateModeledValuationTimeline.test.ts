import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runCorporateSnapshotPipeline } from '../runCorporateSnapshot.ts';

async function loadProjectFixture(fileName: string): Promise<Record<string, unknown>> {
  const fixturePath = path.resolve('src/lib/snapshot/__tests__/fixtures', fileName);
  const fixtureRaw = await readFile(fixturePath, 'utf8');
  return JSON.parse(fixtureRaw) as Record<string, unknown>;
}

test('corporate modeled valuation timeline supports multiple productionStartPeriod markers', async () => {
  const p6 = await loadProjectFixture('p6.los-ricos-south.project_json_v1.json');
  const p5 = await loadProjectFixture('p5.los-ricos-north.project_json_v1.json');

  const body = {
    targetCurrency: 'USD',
    discountRate: 0.1,
    projects: [
      { projectId: 'p6', rawJson: p6 },
      { projectId: 'p5', rawJson: p5 },
    ],
    market: {
      shares_current: 100000000,
      price_current_TargetCurrency: 1.5,
      preferredEquity_TargetCurrency: 0,
      minorityInterest_TargetCurrency: 0,
    },
    balanceSheet: {
      cash_t0_TargetCurrency: 0,
      debt_t0_TargetCurrency: 0,
    },
    scenario: {
      mode: 'fixed',
      fixedPriceByKey: {
        XAU_USD_TOZ: 2330,
        XAG_USD_TOZ: 26.8,
        CU_USD_LB: 4,
        FX_USD_USD: 1,
      },
    },
    fx: {
      source: 'manual',
      anchor: 'today',
      scenario: { mode: 'spot' },
      manual_fx_USD_to_TargetCurrency: 1,
    },
  };

  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const timeline = result.snapshot.modeledValuationTimeline;
  assert.ok(timeline);
  assert.deepEqual(timeline.tps, [4, 5]);
  assert.equal(timeline.lastTp, 5);
  assert.equal(timeline.rangeEndTp, 5);

  const markerTps = timeline.markers.map((marker) => marker.tp);
  assert.deepEqual(markerTps, [4, 5]);

  const diagnosticsMeta = (result.diagnostics.meta ?? {}) as Record<string, unknown>;
  const timelineDebug = diagnosticsMeta.corporateModeledValuationTimeline as { tps?: number[]; lastTp?: number | null } | undefined;
  assert.ok(timelineDebug);
  assert.deepEqual(timelineDebug?.tps, [4, 5]);
  assert.equal(timelineDebug?.lastTp, 5);
});
