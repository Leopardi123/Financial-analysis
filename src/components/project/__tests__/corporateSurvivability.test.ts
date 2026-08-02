import assert from 'node:assert/strict'; import test from 'node:test'; import { readFile } from 'node:fs/promises';
import { computeCorporateCashWaterfall } from '../../../lib/corporate/financing/cashWaterfall.ts';
import { buildCorporateSurvivabilityModel } from '../corporateSurvivabilityModel.ts';
import { createSurvivabilityScenarioRequest } from '../../../hooks/useCorporateSurvivability.ts';

const snapshot = (fcff: number[], years = fcff.map((_, index) => 2026 + index), productionStartYear = 2026, capex = fcff.map(() => 0)) => ({
  targetCurrency: 'SEK',
  series: { fcffUSD: fcff }, market: { shares_current: 100 },
  financing: { corporate_cash_waterfall: computeCorporateCashWaterfall({ latestQuarterlyCash: 10, useLatestQuarterlyCash: true, cashUsedPercent: 1, minimumCashReserve: 5, debtPercent: 0, fxUSDToTargetCurrency: 1, equityRaisePriceTargetCurrency: 1, sharesCurrent: 100, yearsByPeriod: years, projects: [{ projectId: 'A', constructionStartPeriod: 0, capexNeedByPeriod: capex, fcffIncludesConstructionCapex: true, fcffByPeriod: fcff }] }) },
  corporateValuationTimeSeries: { valuationYear: 2026, rows: years.map((year, index) => ({ year, npvAbsolute: index === 1 ? null : 50 - index * 10, navAbsolute: index === 2 ? null : 45 - index * 12 })), projectMarkers: [{ productionStartYear, productionStartPeriod: years.indexOf(productionStartYear) }] },
  NPV_today_TargetCurrency: 50, NAV_today_TargetCurrency: 45,
}) as any;

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

test('analysis excludes historical and construction years and measures only operating funding', () => {
  const years = [2025, 2026, 2027, 2028, 2029]; const capex = [100, 200, 100, 0, 0];
  const base = snapshot([-100, -200, -100, 20, 20], years, 2028, capex);
  const stressed = snapshot([-100, -200, -100, -30, 10], years, 2028, capex);
  const model = buildCorporateSurvivabilityModel({ scenarioId: 'spot50', snapshot: stressed, baseSnapshot: base, financingMode: 'dynamic' });
  assert.deepEqual(model.rows.map((row) => row.year), [2028, 2029]);
  assert.equal(model.analysisStartYear, 2028); assert.equal(model.metrics.firstNegativeFcffYear, 2028);
  assert.equal(model.metrics.firstFinancingYear, 2028); assert.equal(model.metrics.largestAnnualFundingNeed, 30);
  assert.equal(model.metrics.newShares, 30, 'construction shares are excluded from operating dilution');
});

test('scenario canonical valuation rows preserve values, null and the analysis window independently of financing mode', () => {
  const years = [2025, 2026, 2027, 2028]; const base = snapshot([1,1,1,1], years, 2027);
  const stressed = snapshot([-1,-1,-1,-1], years, 2027);
  stressed.corporateValuationTimeSeries.rows = [
    { year: 2025, npvAbsolute: 999, navAbsolute: 999 }, { year: 2026, npvAbsolute: 888, navAbsolute: 888 },
    { year: 2027, npvAbsolute: -123.5, navAbsolute: null }, { year: 2028, npvAbsolute: null, navAbsolute: -456.25 },
  ];
  const dynamic = buildCorporateSurvivabilityModel({ scenarioId: 'spot50', snapshot: stressed, baseSnapshot: base, financingMode: 'dynamic' });
  const fixed = buildCorporateSurvivabilityModel({ scenarioId: 'spot50', snapshot: stressed, baseSnapshot: base, financingMode: 'fixed' });
  assert.equal(dynamic.targetCurrency, 'SEK');
  assert.deepEqual(dynamic.valuationRows, [{ year: 2027, npvAbsolute: -123.5, navAbsolute: null }, { year: 2028, npvAbsolute: null, navAbsolute: -456.25 }]);
  assert.deepEqual(fixed.valuationRows, dynamic.valuationRows);
  assert.notDeepEqual(dynamic.valuationRows, buildCorporateSurvivabilityModel({ scenarioId: 'base', snapshot: base, baseSnapshot: base, financingMode: 'dynamic' }).valuationRows);
});

test('scenario request definitions use full pipeline controls without mutating base', () => {
  const base = { scenario: { mode: 'spot' }, fx: { source: 'manual', anchor: 'today', scenario: { mode: 'spot' }, manual_fx_USD_to_TargetCurrency: 1 }, projects: [] } as any;
  assert.equal(createSurvivabilityScenarioRequest(base, 'spot20').scenario.spotPriceMultiplier, .8);
  assert.deepEqual(createSurvivabilityScenarioRequest(base, 'opex25').stressOptions, { opex25: true });
  assert.deepEqual(createSurvivabilityScenarioRequest(base, 'sustaining50').stressOptions, { sustainingCapex15: true });
  const combined = createSurvivabilityScenarioRequest(base, 'combined'); assert.equal(combined.scenario.spotPriceMultiplier, .7); assert.deepEqual(combined.stressOptions, { opex15: true }); assert.equal(base.stressOptions, undefined);
});

test('survivability page contract explains operating bars and separates production-start build CAPEX', async () => {
  const source = await readFile('src/components/project/CorporateSurvivabilityAnalysis.tsx', 'utf8');
  for (const token of ['Closing cash','Minimum reserve','Negativ FCFF','negative-fcff','täcks av cash som byggts upp tidigare','Unfunded gap','Operating debt raised','inte skuldstock, ränta eller amortering','Varför syns stapeln','Övriga visade år behöver ingen ny driftfinansiering','Initial/build CAPEX','Construction funding need','role="dialog"','aria-pressed','Produktionsstopp','Kräver högre upplösning i produktionsmodellen.','Corporate survivability analysis','Likviditet','Värdekurvor','Stress-NPV, kvarvarande värde','Canonical stress-NAV','survivability-zero','Värde, inte likviditet','canonical net-cash bridge','Årsvis stress-NPV/NAV är inte beräkningsbar för scenariot.']) assert.match(source, new RegExp(token));
  const css = await readFile('src/index.css', 'utf8'); assert.match(css, /@media \(max-width: 700px\).*corporate-survivability-header/s); assert.match(css, /survivability-chart-scroll.*overflow-x: auto/); assert.match(css, /survivability-chart-toggle button:focus-visible/);
});
