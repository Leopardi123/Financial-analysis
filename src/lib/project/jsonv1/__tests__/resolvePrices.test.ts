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
  const base = getProjectJsonV1Template();
  base.economicsBreakdown = null;
  base.time.masterN = 2;
  base.time.productionStartPeriod = 1;
  base.time.periodEndDatesUtc = ['2024-12-31', '2025-12-31', '2026-12-31'];

  base.series.capexUSD = [100, 20, 10];
  base.series.operatingCostsUSD = [0, 1, 2];
  base.series.sustainingCapexUSD = [0, 0, 0];
  base.series.siteGandA_USD = [0, 0, 0];
  base.series.reclamationUSD = [0, 0, 0];
  base.series.byproductCreditsUSD = [0, 0, 0];
  base.series.workingCapitalDeltaUSD = [0, 0, 0];

  if (base.operations) {
    base.operations.oreMilledTonnes = [null, null, null];
    base.operations.oreMinedTonnes = [null, null, null];
  }

  base.metals.payableQtyByMetal = {
    Au: [0, 10, 10],
    Cu: [1, 1, 1],
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

  assertEqual(resolved.spotPriceUSDByMetal.Au.length, 3, 'resolved Au series length');
  assertEqual(resolved.spotPriceUSDByMetal.Au[0], 11, 'explicit date mapping at t0');
  assertEqual(resolved.spotPriceUSDByMetal.Au[1], 11, 'spot mode replicates anchor value at t1');
  assertEqual(resolved.spotPriceUSDByMetal.Au[2], 11, 'spot mode replicates anchor value at t2');

  const expectedLb = 2204.6226218487757;
  const gotLb = resolved.payableQtyByMetal.Cu[0];
  assert(gotLb !== null, 'converted qty should not be null');
  assert(Math.abs((gotLb as number) - expectedLb) < 1e-9, 'tonne to lb conversion should apply');

  const missingEarlierData = getProjectJsonV1Template();
  missingEarlierData.economicsBreakdown = null;
  missingEarlierData.time.masterN = 0;
  missingEarlierData.time.productionStartPeriod = 0;
  missingEarlierData.time.periodEndDatesUtc = ['2024-01-01'];
  missingEarlierData.series.capexUSD = [0];
  missingEarlierData.series.operatingCostsUSD = [0];
  missingEarlierData.series.sustainingCapexUSD = [0];
  missingEarlierData.series.siteGandA_USD = [0];
  missingEarlierData.series.reclamationUSD = [0];
  missingEarlierData.series.byproductCreditsUSD = [0];
  missingEarlierData.series.workingCapitalDeltaUSD = [0];
  missingEarlierData.metals.payableQtyByMetal = { Au: [1] };
  missingEarlierData.metals.payableQtyUnitByMetal = { Au: 'toz' };
  missingEarlierData.metals.priceKeyByMetal = { Au: 'XAU_USD_TOZ' };

  if (missingEarlierData.operations) {
    missingEarlierData.operations.oreMilledTonnes = [null];
    missingEarlierData.operations.oreMinedTonnes = [null];
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
  assertEqual(missingResolved.spotPriceUSDByMetal.Au[0], null, 'missing earlier data resolves to null');

  const fallbackBase = getProjectJsonV1Template();
  fallbackBase.economicsBreakdown = null;
  fallbackBase.time.masterN = 0;
  fallbackBase.time.productionStartPeriod = 0;
  fallbackBase.time.periodEndDatesUtc = undefined;
  fallbackBase.series.capexUSD = [0];
  fallbackBase.series.operatingCostsUSD = [0];
  fallbackBase.series.sustainingCapexUSD = [0];
  fallbackBase.series.siteGandA_USD = [0];
  fallbackBase.series.reclamationUSD = [0];
  fallbackBase.series.byproductCreditsUSD = [0];
  fallbackBase.series.workingCapitalDeltaUSD = [0];
  fallbackBase.metals.payableQtyByMetal = { Au: [1] };
  fallbackBase.metals.payableQtyUnitByMetal = { Au: 'toz' };
  fallbackBase.metals.priceKeyByMetal = { Au: 'XAU_USD_TOZ' };

  if (fallbackBase.operations) {
    fallbackBase.operations.oreMilledTonnes = [null];
    fallbackBase.operations.oreMinedTonnes = [null];
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

  assertEqual(fallbackResolved.meta?.usedFallbackDateMapping, true, 'fallback date mapping is flagged');

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

  assertEqual(overridden.spotPriceUSDByMetal.Au[0], 1, 'override spot prices should win');
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

  assertEqual(percentileMissingWindow.spotPriceUSDByMetal.Au[0], null, 'percentile with no rows resolves null');
  assert((percentileMissingWindow.diagnostics?.warnings.length ?? 0) > 0, 'percentile with no rows emits warnings');


  const spotFutureParsed = parseProjectJsonV1(base);
  const spotCalls: string[][] = [];
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
  assert(spotCalls.every((anchors) => anchors.length === 1 && anchors[0] === '2025-01-15'), 'spot mode should resolve each key once at anchor date');
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
      resolvePriceSeriesFn: async ({ anchorDatesUtc }) => ({ values: anchorDatesUtc.map(() => null), warnings: [] }),
    },
  );
  assert(
    spotWarningResolved.diagnostics?.warnings.some((warning) => warning.includes('projectId=proj-warning-id')) ?? false,
    'spot warnings should include project id when coverage is missing',
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
  console.log('Project JSON v1 resolve prices tests passed');
})();
