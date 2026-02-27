import { computeRevenueByMetalUSD } from '../computeRevenueByMetal.ts';

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

(function runComputeRevenueByMetalTests() {
  const happy = computeRevenueByMetalUSD({
    masterN: 2,
    payableQtyByMetal: {
      Au: [1, 2, 3],
      Ag: [10, 10, 10],
    },
    priceUSDByMetal: {
      Au: [100, 100, 100],
      Ag: [20, 20, 20],
    },
  });

  assertDeepEqual(happy.revenueByMetalUSD.Au, [100, 200, 300], 'Au revenue by metal computed');
  assertDeepEqual(happy.revenueByMetalUSD.Ag, [200, 200, 200], 'Ag revenue by metal computed');
  assertDeepEqual(happy.grossRevenueUSD, [300, 400, 500], 'gross revenue equals per-metal sum');
  assertDeepEqual(happy.deliveredQtyByMetal.Au, [0, 0, 0], 'default delivered qty should be zero without streams');

  const strictNull = computeRevenueByMetalUSD({
    masterN: 2,
    payableQtyByMetal: {
      Au: [1, 2, 3],
      Ag: [10, null, 10],
    },
    priceUSDByMetal: {
      Au: [100, 100, 100],
      Ag: [20, 20, 20],
    },
  });

  assertDeepEqual(strictNull.revenueByMetalUSD.Ag, [200, null, 200], 'null input yields null metal revenue');
  assertDeepEqual(strictNull.grossRevenueUSD, [300, null, 500], 'gross revenue strict-null propagates from any metal');
  assert(
    strictNull.diagnostics.some((line) => line.includes('metal=Ag') && line.includes('nullPeriods')),
    'diagnostics include null period summary',
  );

  const withStreams = computeRevenueByMetalUSD({
    masterN: 0,
    payableQtyByMetal: {
      Au: [100],
    },
    priceUSDByMetal: {
      Au: [10],
    },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.2,
        purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 3 },
      },
    },
  });

  assertDeepEqual(withStreams.deliveredQtyByMetal.Au, [20], 'streamed delivered qty should be exposed');
  assertDeepEqual(withStreams.streamCostToProjectUSDByMetal.Au, [140], 'stream cost to project should be exposed');
  assertDeepEqual(withStreams.revenueByMetalUSD.Au, [860], 'revenue should include streamed purchase cashflow');

  const pctOfSpotNullSpot = computeRevenueByMetalUSD({
    masterN: 0,
    payableQtyByMetal: {
      Au: [100],
    },
    priceUSDByMetal: {
      Au: [null],
    },
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.2,
        purchasePrice: { kind: 'PCT_OF_SPOT', value: 0.3 },
      },
    },
  });

  assertDeepEqual(pctOfSpotNullSpot.revenueByMetalUSD.Au, [null], 'null spot should null-propagate net revenue under pct-of-spot');

  console.log('Revenue by metal tests passed');
})();
