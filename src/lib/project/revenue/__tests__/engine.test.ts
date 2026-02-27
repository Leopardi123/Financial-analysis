import { computeProjectRevenue } from '../engine.ts';

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

(function runProjectRevenueMVITests() {
  const happyPath = computeProjectRevenue({
    masterN: 2,
    payableQtyByMetal: {
      Au: [1, 1, 1],
      Ag: [10, 10, 10],
    },
    priceUSDByMetal: {
      Au: [2000, 2000, 2000],
      Ag: [25, 25, 25],
    },
  });

  assertDeepEqual(happyPath.byMetalRevenueUSD.Au, [2000, 2000, 2000], 'happy path Au revenue');
  assertDeepEqual(happyPath.byMetalRevenueUSD.Ag, [250, 250, 250], 'happy path Ag revenue');
  assertDeepEqual(happyPath.grossRevenueUSD, [2250, 2250, 2250], 'happy path gross revenue');

  const missingAgPrice = computeProjectRevenue({
    masterN: 2,
    payableQtyByMetal: {
      Au: [1, 1, 1],
      Ag: [10, 10, 10],
    },
    priceUSDByMetal: {
      Au: [2000, 2000, 2000],
      Ag: [25, null, 25],
    },
  });

  assertDeepEqual(missingAgPrice.byMetalRevenueUSD.Ag, [250, null, 250], 'missing Ag price should produce null Ag revenue');
  assertDeepEqual(missingAgPrice.grossRevenueUSD, [2250, null, 2250], 'strict gross should be null when any metal is missing');

  const negativeInput = computeProjectRevenue({
    masterN: 2,
    payableQtyByMetal: {
      Au: [1, -1, 1],
    },
    priceUSDByMetal: {
      Au: [2000, 2000, -2000],
    },
  });
  assertDeepEqual(negativeInput.byMetalRevenueUSD.Au, [2000, null, null], 'negative qty/price produce null revenues');
  assertDeepEqual(negativeInput.grossRevenueUSD, [2000, null, null], 'negative qty/price null-propagate gross revenue');

  assertThrows(
    () =>
      computeProjectRevenue({
        masterN: 2,
        payableQtyByMetal: {
          Au: [1, 1, 1],
        },
        priceUSDByMetal: {
          Ag: [25, 25, 25],
        },
      }),
    /must have exactly matching metal keys/,
    'key mismatch should throw',
  );

  assertThrows(
    () =>
      computeProjectRevenue({
        masterN: 2,
        payableQtyByMetal: {
          Au: [1, 1],
        },
        priceUSDByMetal: {
          Au: [2000, 2000, 2000],
        },
      }),
    /length must equal masterN\+1/,
    'length mismatch should throw',
  );

  console.log('Project revenue engine MVI tests passed');
})();
