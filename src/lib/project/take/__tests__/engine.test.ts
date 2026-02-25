import { computeProjectTakeMVI } from '../engine.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert(thrown instanceof Error, `${message}. Expected function to throw`);
  assert(pattern.test((thrown as Error).message), `${message}. Error message did not match pattern`);
}

(function runTakeEngineMVITests() {
  const happyPath = computeProjectTakeMVI({
    masterN: 3,
    grossRevenueUSD: [0, 100, 100, 50],
    items: [
      {
        id: 'nsr',
        base: { baseType: 'REVENUE' },
        rate: { rateType: 'FIXED', value: 0.02 },
      },
      {
        id: 'gov',
        appliesTo: { start_t: 1, end_t: 2 },
        base: { baseType: 'REVENUE' },
        rate: { rateType: 'FIXED', value: 0.05 },
      },
    ],
  });

  assertDeepEqual(happyPath.totalTakeUSD, [0, 7, 7, 1], 'happy path total take');
  assertDeepEqual(happyPath.netRevenueAfterTakeUSD, [0, 93, 93, 49], 'happy path net revenue');

  const tieredHappyPath = computeProjectTakeMVI({
    masterN: 3,
    grossRevenueUSD: [0, 50, 150, 250],
    items: [
      {
        id: 'tiered',
        base: { baseType: 'REVENUE' },
        rate: {
          rateType: 'TIERED',
          thresholdType: 'revenue',
          tiers: [
            { thresholdValue: 0, rate: 0.01 },
            { thresholdValue: 100, rate: 0.02 },
            { thresholdValue: 200, rate: 0.03 },
          ],
        },
      },
    ],
  });

  assertDeepEqual(tieredHappyPath.takeByItemUSD.tiered, [0, 0.5, 3, 7.5], 'tiered happy path item take');
  assertDeepEqual(tieredHappyPath.totalTakeUSD, [0, 0.5, 3, 7.5], 'tiered happy path total take');

  const metalSpecific = computeProjectTakeMVI({
    masterN: 3,
    grossRevenueUSD: [100, 100, 100, 100],
    byMetalRevenueUSD: {
      Ag: [10, 20, 30, 40],
    },
    items: [
      {
        id: 'ag-take',
        base: { baseType: 'REVENUE', metal: 'Ag' },
        rate: { rateType: 'FIXED', value: 0.1 },
      },
    ],
  });

  assertDeepEqual(metalSpecific.totalTakeUSD, [1, 2, 3, 4], 'metal specific total take');
  assertDeepEqual(metalSpecific.netRevenueAfterTakeUSD, [99, 98, 97, 96], 'metal specific net revenue');

  const metalSpecificTiered = computeProjectTakeMVI({
    masterN: 3,
    grossRevenueUSD: [100, 100, 100, 100],
    byMetalRevenueUSD: {
      Ag: [0, 10, 110, 210],
    },
    items: [
      {
        id: 'ag-tiered',
        base: { baseType: 'REVENUE', metal: 'Ag' },
        rate: {
          rateType: 'TIERED',
          thresholdType: 'revenue',
          tiers: [
            { thresholdValue: 0, rate: 0.01 },
            { thresholdValue: 100, rate: 0.02 },
            { thresholdValue: 200, rate: 0.03 },
          ],
        },
      },
    ],
  });

  assertDeepEqual(metalSpecificTiered.takeByItemUSD['ag-tiered'], [0, 0.1, 2.2, 6.3], 'metal tiered should use metal revenue');

  const missingMetalFallsBack = computeProjectTakeMVI({
    masterN: 3,
    grossRevenueUSD: [100, 100, 100, 100],
    byMetalRevenueUSD: {
      Ag: [10, 20, 30, 40],
    },
    items: [
      {
        id: 'au-take',
        base: { baseType: 'REVENUE', metal: 'Au' },
        rate: { rateType: 'FIXED', value: 0.1 },
      },
    ],
  });

  assertDeepEqual(missingMetalFallsBack.totalTakeUSD, [10, 10, 10, 10], 'missing metal should fallback to gross revenue');
  assertDeepEqual(missingMetalFallsBack.takeByItemUSD['au-take'], [10, 10, 10, 10], 'fallback should not produce null item values');

  const missingBaseAtPeriod = computeProjectTakeMVI({
    masterN: 3,
    grossRevenueUSD: [100, 100, null, 100],
    items: [
      {
        id: 'nsr',
        base: { baseType: 'REVENUE' },
        rate: { rateType: 'FIXED', value: 0.02 },
      },
    ],
  });

  assertDeepEqual(missingBaseAtPeriod.takeByItemUSD.nsr, [2, 2, null, 2], 'missing base should produce null item take at period');
  assertDeepEqual(missingBaseAtPeriod.totalTakeUSD, [2, 2, null, 2], 'missing base should null total in strict aggregation');
  assertDeepEqual(missingBaseAtPeriod.netRevenueAfterTakeUSD, [98, 98, null, 98], 'missing base should null net revenue in strict aggregation');


  const operatingProfitHappyPath = computeProjectTakeMVI({
    masterN: 2,
    grossRevenueUSD: [100, 100, 100],
    operatingProfitUSD: [-10, 50, 200],
    items: [
      {
        id: 'profit-duty',
        base: { baseType: 'OPERATING_PROFIT' },
        rate: { rateType: 'FIXED', value: 0.1 },
      },
    ],
  });

  assertDeepEqual(operatingProfitHappyPath.takeByItemUSD['profit-duty'], [0, 5, 20], 'operating profit duty should apply fixed rate to non-negative profit');
  assertDeepEqual(operatingProfitHappyPath.totalTakeUSD, [0, 5, 20], 'operating profit duty should aggregate into total take');

  assertThrows(
    () =>
      computeProjectTakeMVI({
        masterN: 2,
        grossRevenueUSD: [100, 100],
        items: [],
      }),
    /grossRevenueUSD length must equal masterN\+1/,
    'length mismatch should throw',
  );

  assertThrows(
    () =>
      computeProjectTakeMVI({
        masterN: 2,
        grossRevenueUSD: [100, 100, 100],
        items: [
          {
            id: 'profit-duty',
            base: { baseType: 'OPERATING_PROFIT' },
            rate: { rateType: 'FIXED', value: 0.1 },
          },
        ],
      }),
    /operatingProfitUSD length must equal masterN\+1 when OPERATING_PROFIT items are configured/,
    'missing operating profit series should throw when required',
  );

  const operatingProfitNullSlot = computeProjectTakeMVI({
    masterN: 2,
    grossRevenueUSD: [100, 100, 100],
    operatingProfitUSD: [50, null, 200],
    items: [
      {
        id: 'profit-null-slot',
        base: { baseType: 'OPERATING_PROFIT' },
        rate: { rateType: 'FIXED', value: 0.1 },
      },
    ],
  });

  assertDeepEqual(operatingProfitNullSlot.takeByItemUSD['profit-null-slot'], [5, null, 20], 'operating profit null slot should produce null item take');
  assertDeepEqual(operatingProfitNullSlot.totalTakeUSD, [5, null, 20], 'operating profit null slot should produce strict null total');

  assertThrows(
    () =>
      computeProjectTakeMVI({
        masterN: 2,
        grossRevenueUSD: [100, 100, 100],
        operatingProfitUSD: [50, 100, 200],
        items: [
          {
            id: 'profit-tiered',
            base: { baseType: 'OPERATING_PROFIT' },
            rate: {
              rateType: 'TIERED',
              thresholdType: 'revenue',
              tiers: [
                { thresholdValue: 0, rate: 0.01 },
                { thresholdValue: 100, rate: 0.02 },
              ],
            },
          },
        ],
      }),
    /rateType TIERED is not supported for baseType OPERATING_PROFIT/,
    'operating profit with tiered rate should throw',
  );

  assertThrows(
    () =>
      computeProjectTakeMVI({
        masterN: 1,
        grossRevenueUSD: [100, 100],
        items: [
          {
            id: 'neg-rate',
            base: { baseType: 'REVENUE' },
            rate: { rateType: 'FIXED', value: -0.1 },
          },
        ],
      }),
    /rate.value must be finite and >= 0/,
    'negative rate should throw',
  );

  assertThrows(
    () =>
      computeProjectTakeMVI({
        masterN: 1,
        grossRevenueUSD: [100, 100],
        items: [
          {
            id: 'bad-tier-first-threshold',
            base: { baseType: 'REVENUE' },
            rate: {
              rateType: 'TIERED',
              thresholdType: 'revenue',
              tiers: [
                { thresholdValue: 50, rate: 0.02 },
                { thresholdValue: 100, rate: 0.03 },
              ],
            },
          },
        ],
      }),
    /first tier thresholdValue must be 0/,
    'first tier threshold should be zero',
  );

  assertThrows(
    () =>
      computeProjectTakeMVI({
        masterN: 1,
        grossRevenueUSD: [100, 100],
        items: [
          {
            id: 'bad-tier-order',
            base: { baseType: 'REVENUE' },
            rate: {
              rateType: 'TIERED',
              thresholdType: 'revenue',
              tiers: [
                { thresholdValue: 0, rate: 0.01 },
                { thresholdValue: 200, rate: 0.03 },
                { thresholdValue: 100, rate: 0.02 },
              ],
            },
          },
        ],
      }),
    /tiers must be sorted ascending by thresholdValue/,
    'unsorted tiers should throw',
  );

  assertThrows(
    () =>
      computeProjectTakeMVI({
        masterN: 3,
        grossRevenueUSD: [100, 100, 100, 100],
        items: [
          {
            id: 'bad-window',
            appliesTo: { start_t: 2, end_t: 1 },
            base: { baseType: 'REVENUE' },
            rate: { rateType: 'FIXED', value: 0.1 },
          },
        ],
      }),
    /start_t must be <= end_t/,
    'start_t > end_t should throw',
  );

  console.log('Project take engine MVI tests passed');
})();
