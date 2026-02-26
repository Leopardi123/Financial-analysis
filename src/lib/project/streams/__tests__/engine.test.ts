import { applyStreamMVI } from '../engine.ts';

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

(function runProjectStreamsMVITests() {
  const happyPath = applyStreamMVI({
    masterN: 2,
    payableQty: [100, 100, 100],
    spotPriceUSDPerUnit: [10, 10, 10],
    config: {
      streamPctOfPayable: 0.1,
      purchasePrice: { kind: 'PCT_OF_SPOT', value: 0.2 },
    },
  });

  assertDeepEqual(happyPath.deliveredQty, [10, 10, 10], 'happy path delivered qty');
  assertDeepEqual(happyPath.effectivePayableQty, [90, 90, 90], 'happy path effective payable qty');
  assertDeepEqual(happyPath.streamTakeUSD, [80, 80, 80], 'happy path stream take');
  assertDeepEqual(happyPath.remainingCapEnd, null, 'happy path remaining cap for no cap');

  const withCap = applyStreamMVI({
    masterN: 2,
    payableQty: [100, 100, 100],
    spotPriceUSDPerUnit: [10, 10, 10],
    config: {
      streamPctOfPayable: 0.2,
      deliveryCapTotalQty: 15,
      purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 1 },
    },
  });

  assertDeepEqual(withCap.deliveredQty, [15, 0, 0], 'cap should clamp delivered quantity by remaining cap');
  assertDeepEqual(withCap.effectivePayableQty, [85, 100, 100], 'cap should preserve effective payable qty');
  assertDeepEqual(withCap.remainingCapEnd, 0, 'cap should end at zero after full delivery');

  const withTimingWindow = applyStreamMVI({
    masterN: 2,
    payableQty: [100, 100, 100],
    spotPriceUSDPerUnit: [10, 10, 10],
    config: {
      streamPctOfPayable: 0.1,
      start_t: 1,
      end_t: 1,
      purchasePrice: { kind: 'PCT_OF_SPOT', value: 0.2 },
    },
  });

  assertDeepEqual(withTimingWindow.deliveredQty, [0, 10, 0], 'timing window should only deliver in active period');
  assertDeepEqual(withTimingWindow.effectivePayableQty, [100, 90, 100], 'timing window effective payable qty');
  assertDeepEqual(withTimingWindow.streamTakeUSD, [0, 80, 0], 'timing window stream take');

  const missingSpot = applyStreamMVI({
    masterN: 2,
    payableQty: [100, 100, 100],
    spotPriceUSDPerUnit: [10, null, 10],
    config: {
      streamPctOfPayable: 0.1,
      purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 2 },
    },
  });

  assertDeepEqual(missingSpot.deliveredQty, [10, 10, 10], 'delivery should still be computed when spot missing');
  assertDeepEqual(missingSpot.streamTakeUSD, [80, null, 80], 'stream take should be null when delivered > 0 and spot missing');

  assertThrows(
    () =>
      applyStreamMVI({
        masterN: 1,
        payableQty: [100, 100],
        spotPriceUSDPerUnit: [10, 10],
        config: {
          streamPctOfPayable: 1.2,
          purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 1 },
        },
      }),
    /streamPctOfPayable must be finite and within \[0, 1\]/,
    'streamPctOfPayable > 1 should throw',
  );

  assertThrows(
    () =>
      applyStreamMVI({
        masterN: 1,
        payableQty: [100, 100],
        spotPriceUSDPerUnit: [10, 10],
        config: {
          streamPctOfPayable: 0.1,
          deliveryCapTotalQty: -1,
          purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 1 },
        },
      }),
    /deliveryCapQty must be finite and > 0 when provided/,
    'negative cap should throw',
  );

  assertThrows(
    () =>
      applyStreamMVI({
        masterN: 1,
        payableQty: [100, 100],
        spotPriceUSDPerUnit: [10, 10],
        config: {
          streamPctOfPayable: 0.1,
          purchasePrice: { kind: 'PCT_OF_SPOT', value: 1.1 },
        },
      }),
    /pctOfSpot must be finite and within \[0, 1\]/,
    'purchase pct > 1 should throw',
  );

  assertThrows(
    () =>
      applyStreamMVI({
        masterN: 1,
        payableQty: [-1, 100],
        spotPriceUSDPerUnit: [10, 10],
        config: {
          streamPctOfPayable: 0.1,
          purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 1 },
        },
      }),
    /payableQty\[0\] cannot be negative/,
    'negative payable qty should throw',
  );
  console.log('Project streams MVI tests passed');
})();
