import { computeStreamsByMetal } from '../compute.ts';

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

(function runComputeStreamsByMetalTests() {
  const basic = computeStreamsByMetal({
    masterN: 2,
    payableQtyByMetal: { Au: [100, 100, 100] },
    spotPriceUSDByMetal: { Au: [10, 10, 10] },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.1,
        purchasePriceRule: 'FIXED_USD_PER_UNIT',
        fixedPriceUSDPerUnit: 2,
      },
    },
  });

  assertDeepEqual(basic.deliveredQtyByMetal.Au, [10, 10, 10], 'basic stream should deliver 10% each period');
  assertDeepEqual(basic.effectivePayableQtyByMetal.Au, [90, 90, 90], 'basic stream should reduce effective payable before revenue');

  const timingWindow = computeStreamsByMetal({
    masterN: 2,
    payableQtyByMetal: { Au: [100, 100, 100] },
    spotPriceUSDByMetal: { Au: [10, 10, 10] },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.1,
        start_t: 1,
        end_t: 1,
        purchasePriceRule: 'FIXED_USD_PER_UNIT',
        fixedPriceUSDPerUnit: 2,
      },
    },
  });

  assertDeepEqual(timingWindow.deliveredQtyByMetal.Au, [0, 10, 0], 'timing window should gate stream deliveries');

  const withCap = computeStreamsByMetal({
    masterN: 2,
    payableQtyByMetal: { Au: [100, 100, 100] },
    spotPriceUSDByMetal: { Au: [10, 10, 10] },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.1,
        deliveryCapQty: 15,
        purchasePriceRule: 'FIXED_USD_PER_UNIT',
        fixedPriceUSDPerUnit: 2,
      },
    },
  });

  assertDeepEqual(withCap.deliveredQtyByMetal.Au, [10, 5, 0], 'delivery cap should clamp stream quantity across periods');
  assertDeepEqual(withCap.effectivePayableQtyByMetal.Au, [90, 95, 100], 'delivery cap should preserve post-cap payable quantities');
  assertDeepEqual(withCap.streamValueUSDByMetal.Au, [80, 40, 0], 'fixed purchase stream value should be computed as max(0, spot-purchase)*delivered');

  const nonFinitePayable = computeStreamsByMetal({
    masterN: 2,
    payableQtyByMetal: { Au: [100, Number.NaN, 100] },
    spotPriceUSDByMetal: { Au: [10, 10, 10] },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.1,
        purchasePriceRule: 'FIXED_USD_PER_UNIT',
        fixedPriceUSDPerUnit: 2,
      },
    },
  });

  assertDeepEqual(nonFinitePayable.deliveredQtyByMetal.Au, [10, null, 10], 'non-finite payable should null out delivered quantity');
  assertDeepEqual(nonFinitePayable.effectivePayableQtyByMetal.Au, [90, null, 90], 'non-finite payable should null out effective payable');

  const multiMetal = computeStreamsByMetal({
    masterN: 1,
    payableQtyByMetal: {
      Au: [100, 100],
      Ag: [50, 50],
    },
    spotPriceUSDByMetal: {
      Au: [10, 10],
      Ag: [20, 20],
    },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.1,
        purchasePriceRule: 'FIXED_USD_PER_UNIT',
        fixedPriceUSDPerUnit: 2,
      },
      Ag: {
        streamPctOfPayable: 0.2,
        purchasePriceRule: 'PCT_OF_SPOT',
        pctOfSpot: 0.25,
      },
    },
  });

  assertDeepEqual(multiMetal.deliveredQtyByMetal.Au, [10, 10], 'Au stream should be isolated per metal');
  assertDeepEqual(multiMetal.deliveredQtyByMetal.Ag, [10, 10], 'Ag stream should be isolated per metal');
  assertDeepEqual(multiMetal.effectivePayableQtyByMetal.Au, [90, 90], 'Au effective payable should avoid cross-talk from Ag stream');
  assertDeepEqual(multiMetal.effectivePayableQtyByMetal.Ag, [40, 40], 'Ag effective payable should avoid cross-talk from Au stream');

  assert(
    multiMetal.streamValueUSDByMetal.Au[0] === 80 && multiMetal.streamValueUSDByMetal.Ag[0] === 150,
    'stream values should be independently computed by metal',
  );

  console.log('Streams compute-by-metal tests passed');
})();
