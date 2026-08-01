import assert from 'node:assert/strict'; import test from 'node:test'; import { readFile } from 'node:fs/promises';
import { computeCorporateCashWaterfall } from '../../../lib/corporate/financing/cashWaterfall.ts';
import { buildCorporateSurvivabilityModel } from '../corporateSurvivabilityModel.ts';
import { createSurvivabilityScenarioRequest } from '../../../hooks/useCorporateSurvivability.ts';

const waterfall = (fcff: number[]) => computeCorporateCashWaterfall({ latestQuarterlyCash: 10, useLatestQuarterlyCash: true, cashUsedPercent: 1, minimumCashReserve: 5, debtPercent: 0, fxUSDToTargetCurrency: 1, equityRaisePriceTargetCurrency: 1, sharesCurrent: 100, yearsByPeriod: [2026,2027], projects: [{ projectId: 'A', constructionStartPeriod: 0, capexNeedByPeriod: [0,0], fcffIncludesConstructionCapex: true, fcffByPeriod: fcff }] });
const snapshot = (fcff: number[]) => ({ series: { fcffUSD: fcff }, financing: { corporate_cash_waterfall: waterfall(fcff) }, NPV_today_TargetCurrency: 50, NAV_today_TargetCurrency: 45 }) as any;

test('dynamic survivability classifies funding, headroom, negative FCFF and dilution', () => {
  const base = snapshot([10,10]); const stressed = snapshot([-20,-10]);
  const model = buildCorporateSurvivabilityModel({ scenarioId: 'spot50', snapshot: stressed, baseSnapshot: base, financingMode: 'dynamic' });
  assert.equal(model.status, 'FUNDING_REQUIRED'); assert.equal(model.metrics.firstNegativeFcffYear, 2026);
  assert.equal(model.metrics.negativeFcffYears, 2); assert.ok((model.metrics.newShares as number) > 0);
  assert.ok(model.rows.every((row) => row.closingCash === row.minimumCashReserve && row.unfundedGap === 0));
});

test('fixed financing locks base proceeds and exposes the stress as unfunded gap', () => {
  const base = snapshot([10,10]); const stressed = snapshot([-20,-10]);
  const model = buildCorporateSurvivabilityModel({ scenarioId: 'spot50', snapshot: stressed, baseSnapshot: base, financingMode: 'fixed' });
  assert.equal(model.status, 'CRITICAL'); assert.ok(model.rows.some((row) => (row.unfundedGap ?? 0) > 0)); assert.equal(model.metrics.newShares, 0);
});

test('scenario request definitions use full pipeline controls without mutating base', () => {
  const base = { scenario: { mode: 'spot' }, fx: { source: 'manual', anchor: 'today', scenario: { mode: 'spot' }, manual_fx_USD_to_TargetCurrency: 1 }, projects: [] } as any;
  assert.equal(createSurvivabilityScenarioRequest(base, 'spot20').scenario.spotPriceMultiplier, .8);
  assert.deepEqual(createSurvivabilityScenarioRequest(base, 'opex25').stressOptions, { opex25: true });
  assert.deepEqual(createSurvivabilityScenarioRequest(base, 'sustaining50').stressOptions, { sustainingCapex15: true });
  const combined = createSurvivabilityScenarioRequest(base, 'combined'); assert.equal(combined.scenario.spotPriceMultiplier, .7); assert.deepEqual(combined.stressOptions, { opex15: true }); assert.equal(base.stressOptions, undefined);
});

test('survivability page contract includes graph, drawer, disabled stopp, keyboard buttons and ARIA', async () => {
  const source = await readFile('src/components/project/CorporateSurvivabilityAnalysis.tsx', 'utf8');
  for (const token of ['Closing cash','Minimum reserve','Unfunded gap','role="dialog"','aria-pressed','Produktionsstopp','Kräver högre upplösning i produktionsmodellen.','Corporate survivability analysis']) assert.match(source, new RegExp(token));
  const css = await readFile('src/index.css', 'utf8'); assert.match(css, /@media \(max-width: 700px\).*corporate-survivability-header/s);
});
