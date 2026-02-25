import { applyStreamsByMetal } from '../applyByMetal.ts';

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

(function runProjectStreamsApplyByMetalTests() {
  const happyPath = applyStreamsByMetal({
    masterN: 1,
    payableQtyByMetal: {
      Au: [100, 100],
      Ag: [10, 10],
    },
    spotPriceUSDByMetal: {
      Au: [10, 10],
      Ag: [20, 20],
    },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.1,
        purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 2 },
      },
    },
  });

  assertDeepEqual(happyPath.effectivePayableQtyByMetal.Au, [90, 90], 'effective Au should be reduced by stream');
  assertDeepEqual(happyPath.effectivePayableQtyByMetal.Ag, [10, 10], 'effective Ag should pass through');
  assertDeepEqual(happyPath.streamTakeUSD_total, [80, 80], 'stream total should include streamed Au take');

  const strictNullTotal = applyStreamsByMetal({
    masterN: 1,
    payableQtyByMetal: {
      Au: [100, 100],
      Ag: [10, 10],
    },
    spotPriceUSDByMetal: {
      Au: [null, 10],
      Ag: [20, 20],
    },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.1,
        purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 2 },
      },
    },
  });

  assertDeepEqual(strictNullTotal.streamTakeUSD_byMetal.Au, [null, 80], 'Au take should be null when spot is null and delivered > 0');
  assertDeepEqual(strictNullTotal.streamTakeUSD_total, [null, 80], 'total should be strict-null across streamed metals');

  assertThrows(
    () =>
      applyStreamsByMetal({
        masterN: 1,
        payableQtyByMetal: {
          Au: [100, 100],
        },
        spotPriceUSDByMetal: {
          Au: [10, 10],
        },
        streamsByMetal: {
          Cu: {
            streamPctOfPayable: 0.1,
            purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 2 },
          },
        },
      }),
    /unknown payable metal Cu/,
    'unknown stream metal should throw',
  );

  assertThrows(
    () =>
      applyStreamsByMetal({
        masterN: 1,
        payableQtyByMetal: {
          Au: [100],
        },
        spotPriceUSDByMetal: {
          Au: [10, 10],
        },
        streamsByMetal: {},
      }),
    /payableQtyByMetal\[Au\] length must equal masterN\+1/,
    'series length mismatch should throw',
  );

  console.log('Project streams apply-by-metal tests passed');
})();
