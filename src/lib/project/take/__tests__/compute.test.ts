import { computeTakeEngine } from '../compute.ts';

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
  try { fn(); } catch (error) { thrown = error; }
  assert(thrown instanceof Error, `${message}. Expected function to throw`);
  assert(pattern.test((thrown as Error).message), `${message}. Error message did not match pattern`);
}

(function runComputeTakeEngineTests() {
  const fixed = computeTakeEngine({
    masterN: 2,
    grossRevenueUSD: [0, 1000, 2000],
    takeItems: [{
      id: 'i1',
      jurisdictionLevel: 'national',
      metals: ['ALL'],
      baseType: 'REVENUE',
      rateType: 'FIXED',
      rateFixed: 0.05,
    }],
  });
  assertDeepEqual(fixed.itemTakeUSDById.i1, [0, 50, 100], 'fixed item take');
  assertDeepEqual(fixed.totalTakeUSD, [0, 50, 100], 'fixed total take');

  const tiered = computeTakeEngine({
    masterN: 2,
    grossRevenueUSD: [0, 1000, 2000],
    takeItems: [{
      id: 'i1',
      jurisdictionLevel: 'national',
      metals: ['ALL'],
      baseType: 'REVENUE',
      rateType: 'TIERED_REVENUE',
      tiers: [{ thresholdUSD: 0, rate: 0.02 }, { thresholdUSD: 1500, rate: 0.03 }],
    }],
  });
  assertDeepEqual(tiered.itemTakeUSDById.i1, [0, 20, 60], 'tiered item take');

  const timing = computeTakeEngine({
    masterN: 2,
    grossRevenueUSD: [1000, 1000, 1000],
    takeItems: [{
      id: 'i1',
      jurisdictionLevel: 'national',
      metals: ['ALL'],
      start_t: 1,
      end_t: 1,
      baseType: 'REVENUE',
      rateType: 'FIXED',
      rateFixed: 0.05,
    }],
  });
  assertDeepEqual(timing.itemTakeUSDById.i1, [0, 50, 0], 'timing window');

  const strictNull = computeTakeEngine({
    masterN: 2,
    grossRevenueUSD: [0, null, 1000],
    takeItems: [{
      id: 'i1',
      jurisdictionLevel: 'national',
      metals: ['ALL'],
      baseType: 'REVENUE',
      rateType: 'FIXED',
      rateFixed: 0.05,
    }],
  });
  assert(strictNull.totalTakeUSD[1] === null, 'null strictness for totalTakeUSD');

  assertThrows(
    () => computeTakeEngine({
      masterN: 0,
      grossRevenueUSD: [1],
      takeItems: [{
        id: 'i1',
        jurisdictionLevel: 'national',
        metals: ['ALL'],
        baseType: 'PAYABLE_QTY',
        rateType: 'FIXED',
        rateFixed: 0.05,
      }],
    }),
    /PAYABLE_QTY not supported without unit charge/,
    'payable qty unsupported',
  );

  console.log('Take compute tests passed');
})();
