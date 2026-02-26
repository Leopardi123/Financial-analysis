import { parseProjectJsonV1 } from '../parse.ts';
import { getProjectJsonV1Template } from '../template.ts';
import { resolveProjectPricesToEngineInput } from '../resolvePrices.ts';
import type { PriceKey } from '../../../prices/keys.ts';

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

  const mockRows: Record<PriceKey, Array<{ date: string; close: number }>> = {
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

  const resolved = await resolveProjectPricesToEngineInput(
    {
      parsed,
      from: '2022-01-01',
      to: '2027-01-01',
    },
    {
      readHistoryRows: async ({ priceKey }) => ({ rows: mockRows[priceKey], missing: false }),
    },
  );

  assertEqual(resolved.spotPriceUSDByMetal.Au.length, 3, 'resolved Au series length');
  assertEqual(resolved.spotPriceUSDByMetal.Au[0], 11, 'explicit date mapping at t0');
  assertEqual(resolved.spotPriceUSDByMetal.Au[1], 20, 'explicit date mapping at t1');
  assertEqual(resolved.spotPriceUSDByMetal.Au[2], 25, 'explicit date mapping at t2');

  const expectedLb = 2204.6226218487757;
  const gotLb = resolved.payableQtyByMetal.Cu[0];
  assert(gotLb !== null, 'converted qty should not be null');
  assert(Math.abs((gotLb as number) - expectedLb) < 1e-9, 'tonne to lb conversion should apply');

  const missingEarlierData = getProjectJsonV1Template();
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
      readHistoryRows: async ({ priceKey }) => ({
        rows: priceKey === 'XAU_USD_TOZ' ? [{ date: '2024-06-01', close: 10 }] : [],
        missing: false,
      }),
    },
  );
  assertEqual(missingResolved.spotPriceUSDByMetal.Au[0], null, 'missing earlier data resolves to null');

  const fallbackBase = getProjectJsonV1Template();
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
      readHistoryRows: async ({ priceKey }) => ({
        rows: priceKey === 'XAU_USD_TOZ' ? [{ date: '2024-01-01', close: 1 }] : [],
        missing: false,
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
      readHistoryRows: async ({ priceKey }) => ({ rows: mockRows[priceKey], missing: false }),
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
      readHistoryRows: async ({ priceKey }) => ({
        rows: priceKey === 'XAU_USD_TOZ'
          ? [
              { date: '2018-01-01', close: 1100 },
              { date: '2019-01-01', close: 1200 },
              { date: '2020-01-01', close: 1300 },
              { date: '2021-01-01', close: 1400 },
              { date: '2022-01-01', close: 1500 },
            ]
          : [
              { date: '2018-01-01', close: 2 },
              { date: '2019-01-01', close: 3 },
              { date: '2020-01-01', close: 4 },
              { date: '2021-01-01', close: 5 },
              { date: '2022-01-01', close: 6 },
            ],
        missing: false,
      }),
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
      readHistoryRows: async () => ({ rows: [], missing: false }),
    },
  );

  assertEqual(percentileMissingWindow.spotPriceUSDByMetal.Au[0], null, 'percentile with no rows resolves null');
  assert((percentileMissingWindow.diagnostics?.warnings.length ?? 0) > 0, 'percentile with no rows emits warnings');

  const fixedResolved = await resolveProjectPricesToEngineInput(
    {
      parsed,
      scenario: { mode: 'fixed', fixedPriceByKey: { XAU_USD_TOZ: 2400, CU_USD_LB: 4 } },
    },
    {
      readHistoryRows: async () => ({ rows: [], missing: false }),
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
      readHistoryRows: async () => ({ rows: [], missing: false }),
    },
  );

  assertEqual(fixedMissing.spotPriceUSDByMetal.Au[0], null, 'fixed mode missing key resolves null');
  assert((fixedMissing.diagnostics?.warnings.some((w) => w.includes('Missing fixed price for key XAU_USD_TOZ')) ?? false), 'fixed mode missing key warning contains key');
  console.log('Project JSON v1 resolve prices tests passed');
})();
