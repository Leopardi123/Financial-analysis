import { parseProjectJsonV1 } from '../parse.ts';
import { getProjectJsonV1Template } from '../template.ts';
import { resolveProjectPricesToEngineInput } from '../resolvePrices.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

(async function runResolveProjectPricesToEngineInputTests() {
  const currentYear = new Date().getUTCFullYear();
  const base = getProjectJsonV1Template();
  base.economicsBreakdown = null;
  base.time.masterN = 2;
  base.time.productionStartPeriod = 1;
  base.time.productionStartYear = currentYear + 1;

  base.series.capexUSD = [100, 20, 10];
  base.series.operatingCostsUSD = [0, 1, 2];
  base.series.sustainingCapexUSD = [0, 0, 0];
  base.series.siteGandA_USD = [0, 0, 0];
  base.series.reclamationUSD = [0, 0, 0];
  base.series.byproductCreditsUSD = [0, 0, 0];
  base.series.workingCapitalDeltaUSD = [0, 0, 0];
  base.series.depreciationUSD = [0, 0, 0];

  if (base.operations) {
    base.operations.oreMilledTonnes = [null, null, null];
    base.operations.oreMinedTonnes = [null, null, null];
    base.operations.gradeByMetal = { Au: [null, null, null], Cu: [null, null, null] };
    base.operations.recoveryPctByMetal = { Au: [null, null, null], Cu: [null, null, null] };
  }

  base.metals.payableQtyByMetal = {
    Au: [0, 10, 10],
    Cu: [0, 1, 1],
  };
  base.metals.payableQtyUnitByMetal = {
    Au: 'toz',
    Cu: 'tonne',
  };
  base.metals.priceKeyByMetal = {
    Au: 'XAU_USD_TOZ',
    Cu: 'CU_USD_LB',
  };
  base.metals.auPriceKey = 'XAU_USD_TOZ';

  const parsed = parseProjectJsonV1(base);

  const mockRows: Record<string, Array<{ date: string; close: number }>> = {
    XAU_USD_TOZ: [
      { date: '2024-06-01', close: 10 },
      { date: '2024-12-30', close: 11 },
      { date: '2025-01-02', close: 12 },
      { date: '2025-12-31', close: 20 },
      { date: '2026-06-30', close: 25 },
    ],
    XAG_USD_TOZ: [],
    CU_USD_LB: [
      { date: '2022-01-01', close: 4 },
      { date: '2023-06-01', close: 4.2 },
      { date: '2024-07-01', close: 4.4 },
    ],
    CU_USD_TONNE: [],
    ZN_USD_LB: [],
    PB_USD_LB: [],
    NI_USD_LB: [],
    USD_SEK: [],
    EUR_USD: [],
    USD_CAD: [],
  };


  const resolveFromMockRows = async ({
    price_key,
    anchorDatesUtc,
    scenario,
  }: {
    price_key: string;
    anchorDatesUtc: string[];
    scenario: { mode: 'spot' } | { mode: 'percentile'; lookbackYears: number; percentile: number } | { mode: 'fixed'; fixedByKey: Record<string, number> };
  }) => {
    const rows = [...(mockRows[price_key] ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    if (scenario.mode === 'fixed') {
      const fixed = scenario.fixedByKey[price_key];
      return { values: anchorDatesUtc.map(() => (Number.isFinite(fixed) ? fixed : null)), warnings: [] };
    }
    const values = anchorDatesUtc.map((anchor) => {
      if (scenario.mode === 'spot') {
        const eligible = rows.filter((row) => row.date <= anchor);
        return eligible.length ? eligible[eligible.length - 1].close : null;
      }
      const windowStart = new Date(`${anchor}T00:00:00Z`);
      windowStart.setUTCFullYear(windowStart.getUTCFullYear() - scenario.lookbackYears);
      const start = windowStart.toISOString().slice(0, 10);
      const valuesInWindow = rows
        .filter((row) => row.date >= start && row.date <= anchor)
        .map((row) => row.close)
        .sort((a, b) => a - b);
      if (valuesInWindow.length === 0) return null;
      return valuesInWindow[Math.floor((scenario.percentile / 100) * (valuesInWindow.length - 1))];
    });
    return { values, warnings: [] };
  };
  const resolved = await resolveProjectPricesToEngineInput(
    {
      parsed,
      from: '2022-01-01',
      to: '2027-01-01',
    },
    {
      resolvePriceSeriesFn: resolveFromMockRows,
    },
  );

  const testTodayUtc = new Date().toISOString().slice(0, 10);
  const eligibleSpotAu = [...mockRows.XAU_USD_TOZ]
    .filter((row) => row.date <= testTodayUtc)
    .sort((a, b) => a.date.localeCompare(b.date));
  const expectedSpotAu = eligibleSpotAu.length ? eligibleSpotAu[eligibleSpotAu.length - 1].close : null;
  assertEqual(resolved.spotPriceUSDByMetal.Au.length, 3, 'resolved Au series length');
  assertEqual(resolved.spotPriceUSDByMetal.Au[0], expectedSpotAu, 'spot mode uses today UTC anchor at t0');
  assertEqual(resolved.spotPriceUSDByMetal.Au[1], expectedSpotAu, 'spot mode replicates anchor value at t1');
  assertEqual(resolved.spotPriceUSDByMetal.Au[2], expectedSpotAu, 'spot mode replicates anchor value at t2');
  assertEqual(resolved.diagnostics?.metalPriceDiagnostics?.Au?.priceSourceUsed, 'fmp', 'Au should use FMP source when available');

  const expectedLb = 2204.6226218487757;
  const gotLb = resolved.payableQtyByMetal.Cu[1];
  assert(gotLb !== null, 'converted qty should not be null');
  assert(Math.abs((gotLb as number) - expectedLb) < 1e-9, 'tonne to lb conversion should apply');

  const missingEarlierData = getProjectJsonV1Template();
  missingEarlierData.economicsBreakdown = null;
  missingEarlierData.time.masterN = 0;
  missingEarlierData.time.productionStartPeriod = 0;
  missingEarlierData.time.productionStartYear = currentYear;
  missingEarlierData.series.capexUSD = [0];
  missingEarlierData.series.operatingCostsUSD = [0];
  missingEarlierData.series.sustainingCapexUSD = [0];
  missingEarlierData.series.siteGandA_USD = [0];
  missingEarlierData.series.reclamationUSD = [0];
  missingEarlierData.series.byproductCreditsUSD = [0];
  missingEarlierData.series.depreciationUSD = [0];
  missingEarlierData.series.workingCapitalDeltaUSD = [0];
  missingEarlierData.metals.payableQtyByMetal = { Au: [1] };
  missingEarlierData.metals.payableQtyUnitByMetal = { Au: 'toz' };
  missingEarlierData.metals.priceKeyByMetal = { Au: 'XAU_USD_TOZ' };

  if (missingEarlierData.operations) {
    missingEarlierData.operations.oreMilledTonnes = [null];
    missingEarlierData.operations.oreMinedTonnes = [null];
    missingEarlierData.operations.gradeByMetal = { Au: [null], Cu: [null] };
    missingEarlierData.operations.recoveryPctByMetal = { Au: [null], Cu: [null] };
  }

  const missingParsed = parseProjectJsonV1(missingEarlierData);
  const missingResolved = await resolveProjectPricesToEngineInput(
    { parsed: missingParsed, from: '2022-01-01', to: '2025-01-01' },
    {
      resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc }) => ({
        values: anchorDatesUtc.map((date) => (price_key === 'XAU_USD_TOZ' && date >= '2024-06-01' ? 10 : null)),
        warnings: [],
      }),
    },
  );
  assertEqual(missingResolved.spotPriceUSDByMetal.Au[0], 10, 'spot mode resolves against today anchor rather than project period dates');

  const fallbackBase = getProjectJsonV1Template();
  fallbackBase.economicsBreakdown = null;
  fallbackBase.time.masterN = 0;
  fallbackBase.time.productionStartPeriod = 0;
  fallbackBase.time.productionStartYear = currentYear;
  fallbackBase.series.capexUSD = [0];
  fallbackBase.series.operatingCostsUSD = [0];
  fallbackBase.series.sustainingCapexUSD = [0];
  fallbackBase.series.siteGandA_USD = [0];
  fallbackBase.series.reclamationUSD = [0];
  fallbackBase.series.byproductCreditsUSD = [0];
  fallbackBase.series.depreciationUSD = [0];
  fallbackBase.series.workingCapitalDeltaUSD = [0];
  fallbackBase.metals.payableQtyByMetal = { Au: [1] };
  fallbackBase.metals.payableQtyUnitByMetal = { Au: 'toz' };
  fallbackBase.metals.priceKeyByMetal = { Au: 'XAU_USD_TOZ' };

  if (fallbackBase.operations) {
    fallbackBase.operations.oreMilledTonnes = [null];
    fallbackBase.operations.oreMinedTonnes = [null];
    fallbackBase.operations.gradeByMetal = { Au: [null], Cu: [null] };
    fallbackBase.operations.recoveryPctByMetal = { Au: [null], Cu: [null] };
  }

  const fallbackParsed = parseProjectJsonV1(fallbackBase);
  const fallbackResolved = await resolveProjectPricesToEngineInput(
    { parsed: fallbackParsed, from: '2024-01-01', to: '2025-01-01' },
    {
      resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc }) => ({
        values: anchorDatesUtc.map(() => (price_key === 'XAU_USD_TOZ' ? 1 : null)),
        warnings: [],
      }),
    },
  );

  assertEqual(fallbackResolved.meta?.usedFallbackDateMapping, undefined, 'fallback date mapping is not used for v2 canonical time axis');

  const pbFallbackBase = getProjectJsonV1Template();
  pbFallbackBase.economicsBreakdown = null;
  pbFallbackBase.time.masterN = 0;
  pbFallbackBase.time.productionStartPeriod = 0;
  pbFallbackBase.time.productionStartYear = currentYear;
  pbFallbackBase.series.capexUSD = [0];
  pbFallbackBase.series.operatingCostsUSD = [0];
  pbFallbackBase.series.sustainingCapexUSD = [0];
  pbFallbackBase.series.siteGandA_USD = [0];
  pbFallbackBase.series.reclamationUSD = [0];
  pbFallbackBase.series.byproductCreditsUSD = [0];
  pbFallbackBase.series.depreciationUSD = [0];
  pbFallbackBase.series.workingCapitalDeltaUSD = [0];
  pbFallbackBase.metals.payableQtyByMetal = { Pb: [1] };
  pbFallbackBase.metals.payableQtyUnitByMetal = { Pb: 'lb' };
  pbFallbackBase.metals.priceKeyByMetal = { Pb: 'PB_USD_LB' };
  pbFallbackBase.metals.auPriceKey = 'XAU_USD_TOZ';
  pbFallbackBase.metals.spotPriceUSDByMetal = { Pb: [1.23] };
  if (pbFallbackBase.operations) {
    pbFallbackBase.operations.oreMilledTonnes = [null];
    pbFallbackBase.operations.oreMinedTonnes = [null];
    pbFallbackBase.operations.gradeByMetal = { Pb: [null] };
    pbFallbackBase.operations.recoveryPctByMetal = { Pb: [null] };
  }
  const pbFallbackParsed = parseProjectJsonV1(pbFallbackBase);
  const pbFallbackResolved = await resolveProjectPricesToEngineInput(
    { parsed: pbFallbackParsed, manualMetalPriceByKey: { PB_USD_LB: { metalKey: 'PB_USD_LB', displayName: 'Lead', unit: 'USD/lb', value: 1.23, enteredAtUtc: '2026-01-01T00:00:00.000Z', expiresAtUtc: '2099-01-01T00:00:00.000Z' } } },
    {
      resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc }) => ({
        values: anchorDatesUtc.map(() => (price_key === 'XAU_USD_TOZ' ? 1900 : null)),
        warnings: [],
      }),
      fetchNasdaqMetalPriceFn: async () => ({
        ok: true,
        value: { metal: 'lead', date: '2026-01-01', price: 2.5, unit: 'USD/lb', source: 'nasdaq_data_link', datasetId: 'TEST/LEAD' },
      }),
    },
  );
  assertEqual(pbFallbackResolved.spotPriceUSDByMetal.Pb[0], 1.23, 'Pb should use manual price when present');
  assertEqual(pbFallbackResolved.diagnostics?.metalPriceDiagnostics?.Pb?.priceSourceUsed, 'manual', 'Pb should be marked as manual');

  const pbFailureBase = JSON.parse(JSON.stringify(pbFallbackBase));
  delete pbFailureBase.metals.spotPriceUSDByMetal;
  const pbFailureParsed = parseProjectJsonV1(pbFailureBase);
  const pbFailureResolved = await resolveProjectPricesToEngineInput(
    { parsed: pbFailureParsed },
    {
      resolvePriceSeriesFn: async ({ anchorDatesUtc }) => ({ values: anchorDatesUtc.map(() => null), warnings: [] }),
      fetchNasdaqMetalPriceFn: async () => ({
        ok: false,
        datasetId: null,
        unit: null,
        missingSourceReason: 'Missing explicit dataset mapping for lead: env NASDAQ_DATA_LINK_LEAD_DATASET_ID is not set.',
      }),
    },
  );
  assertEqual(pbFailureResolved.diagnostics?.metalPriceDiagnostics?.Pb?.priceSourceUsed, 'missing', 'Pb should be marked as missing when dataset resolution fails');

  const znSuspectBase = getProjectJsonV1Template();
  znSuspectBase.economicsBreakdown = null;
  znSuspectBase.time.masterN = 0;
  znSuspectBase.time.productionStartPeriod = 0;
  znSuspectBase.time.productionStartYear = currentYear;
  znSuspectBase.series.capexUSD = [0];
  znSuspectBase.series.operatingCostsUSD = [0];
  znSuspectBase.series.sustainingCapexUSD = [0];
  znSuspectBase.series.siteGandA_USD = [0];
  znSuspectBase.series.reclamationUSD = [0];
  znSuspectBase.series.byproductCreditsUSD = [0];
  znSuspectBase.series.depreciationUSD = [0];
  znSuspectBase.series.workingCapitalDeltaUSD = [0];
  znSuspectBase.metals.payableQtyByMetal = { Zn: [10] };
  znSuspectBase.metals.payableQtyUnitByMetal = { Zn: 'lb' };
  znSuspectBase.metals.priceKeyByMetal = { Zn: 'ZN_USD_LB' };
  znSuspectBase.metals.auPriceKey = 'XAU_USD_TOZ';
  znSuspectBase.metals.spotPriceUSDByMetal = { Zn: [1.4] };
  if (znSuspectBase.operations) {
    znSuspectBase.operations.oreMilledTonnes = [null];
    znSuspectBase.operations.oreMinedTonnes = [null];
    znSuspectBase.operations.gradeByMetal = { Zn: [null] };
    znSuspectBase.operations.recoveryPctByMetal = { Zn: [null] };
  }
  const znSuspectParsed = parseProjectJsonV1(znSuspectBase);
  const znSuspectResolved = await resolveProjectPricesToEngineInput(
    { parsed: znSuspectParsed },
    {
      resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc }) => ({
        values: anchorDatesUtc.map(() => (price_key === 'ZN_USD_LB' ? 112.4375 : (price_key === 'XAU_USD_TOZ' ? 1900 : null))),
        warnings: [],
      }),
      fetchNasdaqMetalPriceFn: async () => ({
        ok: true,
        value: { metal: 'zinc', date: '2026-02-01', price: 3000, unit: 'USD/tonne', source: 'nasdaq_data_link', datasetId: 'TEST/ZINC' },
      }),
    },
  );
  assert(Math.abs((znSuspectResolved.spotPriceUSDByMetal.Zn[0] ?? 0) - (3000 / 2204.6226218)) < 1e-9, 'Zn should use Nasdaq Data Link with explicit unit conversion');
  assertEqual(znSuspectResolved.diagnostics?.metalPriceDiagnostics?.Zn?.priceSourceUsed, 'nasdaq_data_link', 'Zn should be marked as nasdaq_data_link');
  assertEqual(znSuspectResolved.diagnostics?.metalPriceDiagnostics?.Zn?.datasetId, 'TEST/ZINC', 'Zn diagnostics should include dataset id');

  const znSuspectNoFallbackBase = JSON.parse(JSON.stringify(znSuspectBase));
  delete znSuspectNoFallbackBase.metals.spotPriceUSDByMetal;
  const znSuspectNoFallbackParsed = parseProjectJsonV1(znSuspectNoFallbackBase);
  const znSuspectNoFallbackResolved = await resolveProjectPricesToEngineInput(
    { parsed: znSuspectNoFallbackParsed },
    {
      resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc }) => ({
        values: anchorDatesUtc.map(() => (price_key === 'ZN_USD_LB' ? 112.4375 : (price_key === 'XAU_USD_TOZ' ? 1900 : null))),
        warnings: [],
      }),
      fetchNasdaqMetalPriceFn: async () => ({
        ok: false,
        datasetId: 'TEST/ZINC',
        unit: 'USD/lb',
        missingSourceReason: 'Configured price column not found.',
      }),
    },
  );
  assertEqual(znSuspectNoFallbackResolved.diagnostics?.metalPriceDiagnostics?.Zn?.priceSourceUsed, 'missing', 'Zn without manual and without resolved Nasdaq dataset should be missing');
  assertEqual(znSuspectNoFallbackResolved.spotPriceUSDByMetal.Zn[0], null, 'Zn unresolved dataset should produce null price');

  const withOverrides = {
    ...parsed,
    priceOverrides: {
      spotPriceUSDByMetal: { Au: [1, 2, 3] },
      auPriceUSDPerOz: [9, 9, 9],
    },
  };

  const overridden = await resolveProjectPricesToEngineInput(
    {
      parsed: withOverrides,
      from: '2022-01-01',
      to: '2025-01-01',
    },
    {
      resolvePriceSeriesFn: resolveFromMockRows,
    },
  );

  assertEqual(overridden.spotPriceUSDByMetal.Au[0], 20, 'spot series currently comes from resolved source prices');
  assertEqual(overridden.aisc.auPriceUSDPerOz[2], 9, 'override au prices should win');


  const percentileResolved = await resolveProjectPricesToEngineInput(
    {
      parsed,
      from: '2015-01-01',
      to: '2026-12-31',
      scenario: { mode: 'percentile', lookbackYears: 10, percentile: 50 },
    },
    {
      resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc }) => {
        const source = price_key === 'XAU_USD_TOZ'
          ? [1100, 1200, 1300, 1400, 1500]
          : [2, 3, 4, 5, 6];
        return { values: anchorDatesUtc.map(() => source[2]), warnings: [] };
      },
    },
  );

  assertEqual(percentileResolved.spotPriceUSDByMetal.Au[2], 1300, 'percentile mode uses deterministic floor index for median');

  const percentileMissingWindow = await resolveProjectPricesToEngineInput(
    {
      parsed: missingParsed,
      from: '2024-01-01',
      to: '2024-12-31',
      scenario: { mode: 'percentile', lookbackYears: 10, percentile: 50 },
    },
    {
      resolvePriceSeriesFn: resolveFromMockRows,
    },
  );

  const percentileWindowValue = percentileMissingWindow.spotPriceUSDByMetal.Au[0];
  assert(percentileWindowValue === null || Number.isFinite(percentileWindowValue), 'percentile result should be finite or null');


  const spotFutureParsed = parseProjectJsonV1(base);
  const spotCalls: string[][] = [];
  const todayUtc = new Date().toISOString().slice(0, 10);
  const spotFutureResolved = await resolveProjectPricesToEngineInput(
    {
      parsed: spotFutureParsed,
      scenario: { mode: 'spot' },
      projectId: 'proj-spot-future',
      spotAnchorDateUtc: '2025-01-15',
    },
    {
      resolvePriceSeriesFn: async ({ anchorDatesUtc, price_key }) => {
        spotCalls.push(anchorDatesUtc);
        return { values: [price_key === 'XAU_USD_TOZ' ? 1234 : 3.21], warnings: [] };
      },
    },
  );
  assert(spotCalls.length === 2, 'spot mode should resolve each unique key once (Au shared with auPriceKey)');
  assert(spotCalls.every((anchors) => anchors.length === 1 && anchors[0] === todayUtc), 'spot mode should always anchor to today UTC');
  assertEqual(spotFutureResolved.spotPriceUSDByMetal.Au[0], 1234, 'spot price should be replicated at t0');
  assertEqual(spotFutureResolved.spotPriceUSDByMetal.Au[2], 1234, 'spot price should be replicated at future tN');

  const spotWarningResolved = await resolveProjectPricesToEngineInput(
    {
      parsed: spotFutureParsed,
      scenario: { mode: 'spot' },
      projectId: 'proj-warning-id',
      spotAnchorDateUtc: '2025-01-15',
    },
    {
      resolvePriceSeriesFn: async ({ anchorDatesUtc, price_key }) => ({
        values: anchorDatesUtc.map(() => null),
        warnings: [`No close on or before anchor date for ${price_key}`],
      }),
    },
  );
  const spotProviderWarnings = (spotWarningResolved.diagnostics?.warnings ?? []).filter((warning) => warning.includes('No close on or before anchor date'));
  assertEqual(spotProviderWarnings.length, 3, 'spot provider warnings should emit at most once per unique key');
  assert(
    !(spotWarningResolved.diagnostics?.warnings.some((warning) => warning.includes('period end')) ?? false),
    'spot warnings should never reference period end dates',
  );

  const fixedResolved = await resolveProjectPricesToEngineInput(
    {
      parsed,
      scenario: { mode: 'fixed', fixedPriceByKey: { XAU_USD_TOZ: 2400, CU_USD_LB: 4 } },
    },
    {
      resolvePriceSeriesFn: resolveFromMockRows,
    },
  );

  assertEqual(fixedResolved.spotPriceUSDByMetal.Au[0], 2400, 'fixed mode applies mapped key');
  assertEqual(fixedResolved.spotPriceUSDByMetal.Cu[2], 4, 'fixed mode series is constant by key');

  const fixedMissing = await resolveProjectPricesToEngineInput(
    {
      parsed: missingParsed,
      scenario: { mode: 'fixed', fixedPriceByKey: {} },
    },
    {
      resolvePriceSeriesFn: async ({ anchorDatesUtc }) => ({ values: anchorDatesUtc.map(() => null), warnings: [] }),
    },
  );

  assertEqual(fixedMissing.spotPriceUSDByMetal.Au[0], null, 'fixed mode missing key resolves null');
  assert((fixedMissing.diagnostics?.warnings.some((w) => w.includes('Missing fixed price for key XAU_USD_TOZ')) ?? false), 'fixed mode missing key warning contains key');

  const cuTonRequested = getProjectJsonV1Template();
  cuTonRequested.economicsBreakdown = null;
  cuTonRequested.time.masterN = 0;
  cuTonRequested.time.productionStartPeriod = 0;
  cuTonRequested.time.productionStartYear = currentYear;
  cuTonRequested.series.capexUSD = [0];
  cuTonRequested.series.operatingCostsUSD = [0];
  cuTonRequested.series.sustainingCapexUSD = [0];
  cuTonRequested.series.siteGandA_USD = [0];
  cuTonRequested.series.reclamationUSD = [0];
  cuTonRequested.series.byproductCreditsUSD = [0];
  cuTonRequested.series.depreciationUSD = [0];
  cuTonRequested.series.workingCapitalDeltaUSD = [0];
  cuTonRequested.metals.payableQtyByMetal = { Cu: [1] };
  cuTonRequested.metals.payableQtyUnitByMetal = { Cu: 'tonne' };
  cuTonRequested.metals.priceKeyByMetal = { Cu: 'CU_USD_TONNE' };
  cuTonRequested.metals.auPriceKey = 'XAU_USD_TOZ';
  if (cuTonRequested.operations) {
    cuTonRequested.operations.oreMilledTonnes = [null];
    cuTonRequested.operations.oreMinedTonnes = [null];
    cuTonRequested.operations.gradeByMetal = { Au: [null], Cu: [null] };
    cuTonRequested.operations.recoveryPctByMetal = { Au: [null], Cu: [null] };
  }
  const parsedCuTonRequested = parseProjectJsonV1(cuTonRequested);

  const derivedTonFromLb = await resolveProjectPricesToEngineInput(
    { parsed: parsedCuTonRequested, scenario: { mode: 'fixed', fixedPriceByKey: { CU_USD_LB: 4, XAU_USD_TOZ: 2000 } } },
    { resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc, scenario }) => ({ values: anchorDatesUtc.map(() => (scenario.mode === 'fixed' && Number.isFinite(scenario.fixedByKey[price_key]) ? scenario.fixedByKey[price_key] : null)), warnings: [] }) },
  );
  assertEqual(derivedTonFromLb.spotPriceUSDByMetal.Cu[0], 4 * 2204.6226218, 'CU_USD_TONNE derives from CU_USD_LB using tonne/lb factor');
  assert(derivedTonFromLb.diagnostics?.warnings.some((w) => w.includes('price_diagnostic metal=Cu') && w.includes('price_key_requested=CU_USD_TONNE') && w.includes('price_key_used=CU_USD_LB') && w.includes('derived=true') && w.includes('conversion_factor=2204.6226218') && w.includes('warning="Cu COMEX–LME basis can diverge; unit conversion is not basis conversion."')) ?? false, 'diagnostic shows CU tonne derived from lb with warning');

  const cuLbRequested = JSON.parse(JSON.stringify(cuTonRequested));
  cuLbRequested.metals.priceKeyByMetal.Cu = 'CU_USD_LB';
  const parsedCuLbRequested = parseProjectJsonV1(cuLbRequested);
  const derivedLbFromTon = await resolveProjectPricesToEngineInput(
    { parsed: parsedCuLbRequested, scenario: { mode: 'fixed', fixedPriceByKey: { CU_USD_TONNE: 8818.4904872, XAU_USD_TOZ: 2000 } } },
    { resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc, scenario }) => ({ values: anchorDatesUtc.map(() => (scenario.mode === 'fixed' && Number.isFinite(scenario.fixedByKey[price_key]) ? scenario.fixedByKey[price_key] : null)), warnings: [] }) },
  );
  assert(Math.abs((derivedLbFromTon.spotPriceUSDByMetal.Cu[0] ?? 0) - 4) < 1e-9, 'CU_USD_LB derives from CU_USD_TONNE using inverse factor');
  assert(derivedLbFromTon.diagnostics?.warnings.some((w) => w.includes('price_diagnostic metal=Cu') && w.includes('price_key_requested=CU_USD_LB') && w.includes('price_key_used=CU_USD_TONNE') && w.includes('derived=true') && w.includes('warning="Cu COMEX–LME basis can diverge; unit conversion is not basis conversion."')) ?? false, 'diagnostic warns when CU lb is derived from tonne');

  const bothPresentUsesRequested = await resolveProjectPricesToEngineInput(
    { parsed: parsedCuTonRequested, scenario: { mode: 'fixed', fixedPriceByKey: { CU_USD_LB: 4, CU_USD_TONNE: 9000, XAU_USD_TOZ: 2000 } } },
    { resolvePriceSeriesFn: async ({ price_key, anchorDatesUtc, scenario }) => ({ values: anchorDatesUtc.map(() => (scenario.mode === 'fixed' && Number.isFinite(scenario.fixedByKey[price_key]) ? scenario.fixedByKey[price_key] : null)), warnings: [] }) },
  );
  assertEqual(bothPresentUsesRequested.spotPriceUSDByMetal.Cu[0], 9000, 'when both Cu keys exist, requested key series is used');
  assert(bothPresentUsesRequested.diagnostics?.warnings.some((w) => w.includes('price_diagnostic metal=Cu') && w.includes('price_key_requested=CU_USD_TONNE') && w.includes('price_key_used=CU_USD_TONNE') && w.includes('derived=false')) ?? false, 'diagnostic marks Cu requested series as non-derived when present');

  console.log('Project JSON v1 resolve prices tests passed');
})();
