import { applyStreamsMVI } from '../applyStreamsMvi.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

(function runApplyStreamsMviTests() {
  const fixed = applyStreamsMVI({
    masterN: 0,
    payableQtyByMetal: { Au: [100] },
    spotPriceUSDByMetal: { Au: [10] },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.2,
        purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 3 },
      },
    },
  });

  assertDeepEqual(fixed.deliveredQtyByMetal.Au, [20], 'fixed: delivered quantity should be pct of payable');
  assertDeepEqual(fixed.effectivePayableQtyByMetal.Au, [80], 'fixed: effective payable should be reduced');
  assertDeepEqual(fixed.streamPurchasePriceUSDByMetal.Au, [3], 'fixed: purchase price series should be fixed');
  assertDeepEqual(fixed.streamCostToProjectUSDByMetal.Au, [140], 'fixed: stream cost should be (spot-purchase)*delivered');
  const fixedNetRevenue = (fixed.effectivePayableQtyByMetal.Au[0] as number) * 10 + (fixed.deliveredQtyByMetal.Au[0] as number) * 3;
  assertEqual(fixedNetRevenue, 860, 'fixed: net revenue identity should hold');

  const pctOfSpot = applyStreamsMVI({
    masterN: 0,
    payableQtyByMetal: { Au: [100] },
    spotPriceUSDByMetal: { Au: [10] },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.2,
        purchasePrice: { kind: 'PCT_OF_SPOT', value: 0.3 },
      },
    },
  });

  assertDeepEqual(pctOfSpot.streamPurchasePriceUSDByMetal.Au, [3], 'pct-of-spot: purchase price should be spot*pct');

  const nullPropagation = applyStreamsMVI({
    masterN: 0,
    payableQtyByMetal: { Au: [100] },
    spotPriceUSDByMetal: { Au: [null] },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.2,
        purchasePrice: { kind: 'PCT_OF_SPOT', value: 0.3 },
      },
    },
  });

  assertDeepEqual(nullPropagation.streamPurchasePriceUSDByMetal.Au, [null], 'null propagation: purchase price should be null with null spot');
  assertDeepEqual(nullPropagation.streamCostToProjectUSDByMetal.Au, [null], 'null propagation: stream cost should be null when spot is null');

  const invalidPctIgnored = applyStreamsMVI({
    masterN: 0,
    payableQtyByMetal: { Au: [100] },
    spotPriceUSDByMetal: { Au: [10] },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 1.5,
        purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 3 },
      },
    },
  });

  assertDeepEqual(invalidPctIgnored.effectivePayableQtyByMetal.Au, [100], 'invalid pct: stream should be ignored');
  assertDeepEqual(invalidPctIgnored.deliveredQtyByMetal.Au, [0], 'invalid pct: delivered should be zero');
  assert(
    invalidPctIgnored.diagnostics.some((line) => line.includes('ignored invalid streamPctOfPayable')),
    'invalid pct: diagnostics should include ignored config note',
  );

  console.log('Apply streams MVI tests passed');
})();
