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

  base.series.capexUSD = [100, 20, 10];
  base.series.operatingCostsUSD = [0, 1, 2];
  base.series.sustainingCapexUSD = [0, 0, 0];
  base.series.siteGandA_USD = [0, 0, 0];
  base.series.reclamationUSD = [0, 0, 0];
  base.series.byproductCreditsUSD = [0, 0, 0];


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
      { date: '2022-01-01', close: 1800 },
      { date: '2023-01-15', close: 1900 },
      { date: '2024-06-01', close: 2000 },
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
      to: '2025-01-01',
    },
    {
      readHistoryRows: async ({ priceKey }) => ({ rows: mockRows[priceKey], missing: false }),
    },
  );

  assertEqual(resolved.spotPriceUSDByMetal.Au.length, 3, 'resolved Au series length');
  assertEqual(resolved.spotPriceUSDByMetal.Au[0], 1800, 'carry-forward at t0');
  assertEqual(resolved.spotPriceUSDByMetal.Au[1], 1800, 'carry-forward at t1');
  assertEqual(resolved.spotPriceUSDByMetal.Au[2], 1900, 'carry-forward at t2');

  const expectedLb = 2204.6226218487757;
  const gotLb = resolved.payableQtyByMetal.Cu[0];
  assert(gotLb !== null, 'converted qty should not be null');
  assert(Math.abs((gotLb as number) - expectedLb) < 1e-9, 'tonne to lb conversion should apply');

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
  console.log('Project JSON v1 resolve prices tests passed');
})();
