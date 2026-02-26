import { computeProjectEngineFromProductionWithStreams } from '../engineFromProductionWithStreams.ts';

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

(function runEngineFromProductionWithStreamsTests() {
  const output = computeProjectEngineFromProductionWithStreams({
    streams: {
      masterN: 1,
      payableQtyByMetal: {
        Au: [100, 100],
      },
      spotPriceUSDByMetal: {
        Au: [10, 10],
      },
      streamsByMetal: {
        Au: {
          streamPctOfPayable: 0.1,
          purchasePrice: {
            kind: 'FIXED_USD_PER_UNIT',
            value: 2,
          },
        },
      },
    },
    revenue: {
      masterN: 1,
      priceUSDByMetal: {
        Au: [10, 10],
      },
    },
    take: {
      masterN: 1,
      items: [],
    },
    phase1: {
      masterN: 1,
      productionStartPeriod: 0,
      operatingCostsUSD: [100, 100],
      sustainingCapexUSD: [0, 0],
      siteGandA_USD: [0, 0],
      reclamationUSD: [0, 0],
      capexUSD: [0, 0],
      taxRate: 0,
    },
    phase2: {
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz: [10, 10],
    },
  });

  assertDeepEqual(output.streams.streamTakeUSD_total, [80, 80], 'stream take should be computed from spot and purchase price');
  assertDeepEqual(output.revenue.grossRevenueUSD, [900, 900], 'gross revenue should use effective payable quantity');
  assertEqual(output.phase1.ebitUSD[0], 720, 'phase1 EBIT should include stream take through royalties');
  assertEqual(output.phase1.ebitUSD[1], 720, 'phase1 EBIT should include stream take through royalties');
  assertDeepEqual(output.aisc.payableAuEqOz, [90, 90], 'AISC payable AuEq ounces should derive from stream-adjusted gross revenue');
  assertEqual(output.aisc.aiscAuEqUSDPerOz_LOM, 2, 'AISC should reflect sustaining cost including stream take');


  const revenueAndTakeBaseOutput = computeProjectEngineFromProductionWithStreams({
    streams: {
      masterN: 2,
      payableQtyByMetal: {
        Au: [100, 100, 100],
      },
      spotPriceUSDByMetal: {
        Au: [10, 10, 10],
      },
      streamsByMetal: {
        Au: {
          streamPctOfPayable: 0.1,
          purchasePriceRule: 'FIXED_USD_PER_UNIT',
          fixedPriceUSDPerUnit: 2,
        },
      },
    },
    revenue: {
      masterN: 2,
      priceUSDByMetal: {
        Au: [10, 10, 10],
      },
    },
    take: {
      masterN: 2,
      items: [
        {
          id: 'rev-royalty',
          jurisdictionLevel: 'national',
          metals: ['Au'],
          baseType: 'REVENUE',
          rateType: 'FIXED',
          rateFixed: 0.1,
        },
      ],
    },
    phase1: {
      masterN: 2,
      productionStartPeriod: 0,
      operatingCostsUSD: [0, 0, 0],
      sustainingCapexUSD: [0, 0, 0],
      siteGandA_USD: [0, 0, 0],
      reclamationUSD: [0, 0, 0],
      capexUSD: [0, 0, 0],
      taxRate: 0,
    },
    phase2: {
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz: [10, 10, 10],
    },
  });

  assertDeepEqual(revenueAndTakeBaseOutput.revenue.byMetalRevenueUSD.Au, [900, 900, 900], 'revenue should be based on effective payable quantity after streams');
  assertDeepEqual(revenueAndTakeBaseOutput.revenue.grossRevenueUSD, [900, 900, 900], 'gross revenue should use post-stream payable quantity');
  assertDeepEqual(revenueAndTakeBaseOutput.take.takeByItemUSD['rev-royalty'], [90, 90, 90], 'revenue-based take should use post-stream revenue base');

  const strictNullOutput = computeProjectEngineFromProductionWithStreams({
    streams: {
      masterN: 1,
      payableQtyByMetal: {
        Au: [100, 100],
      },
      spotPriceUSDByMetal: {
        Au: [null, 10],
      },
      streamsByMetal: {
        Au: {
          streamPctOfPayable: 0.1,
          purchasePrice: {
            kind: 'FIXED_USD_PER_UNIT',
            value: 2,
          },
        },
      },
    },
    revenue: {
      masterN: 1,
      priceUSDByMetal: {
        Au: [null, 10],
      },
    },
    take: {
      masterN: 1,
      items: [],
    },
    phase1: {
      masterN: 1,
      productionStartPeriod: 0,
      operatingCostsUSD: [100, 100],
      sustainingCapexUSD: [0, 0],
      siteGandA_USD: [0, 0],
      reclamationUSD: [0, 0],
      capexUSD: [0, 0],
      taxRate: 0,
    },
    phase2: {
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz: [10, 10],
    },
  });

  assertEqual(strictNullOutput.streams.streamTakeUSD_total[0], null, 'stream take should null-propagate for null spot');
  assertEqual(strictNullOutput.revenue.grossRevenueUSD[0], null, 'revenue should null-propagate for null spot');
  assertEqual(strictNullOutput.take.netRevenueAfterTakeUSD[0], null, 'take should null-propagate for null revenue');
  assertEqual(strictNullOutput.phase1.ebitUSD[0], -100, 'phase1 should follow phase1 null handling rules for revenue/royalties');

  assertThrows(
    () =>
      computeProjectEngineFromProductionWithStreams({
        streams: {
          masterN: 1,
          payableQtyByMetal: { Au: [100, 100] },
          spotPriceUSDByMetal: { Au: [10, 10] },
          streamsByMetal: {},
        },
        revenue: {
          masterN: 0,
          priceUSDByMetal: { Au: [10, 10] },
        },
        take: {
          masterN: 1,
          items: [],
        },
        phase1: {
          masterN: 1,
          productionStartPeriod: 0,
          operatingCostsUSD: [0, 0],
          sustainingCapexUSD: [0, 0],
          siteGandA_USD: [0, 0],
          reclamationUSD: [0, 0],
          capexUSD: [0, 0],
        },
        phase2: { discountRate: 0.1 },
        aisc: { auPriceUSDPerOz: [10, 10] },
      }),
    /streams.masterN must match revenue.masterN/,
    'wrapper should validate masterN consistency',
  );

  assertThrows(
    () =>
      computeProjectEngineFromProductionWithStreams({
        streams: {
          masterN: 1,
          payableQtyByMetal: { Au: [100, 100] },
          spotPriceUSDByMetal: { Au: [10, 10] },
          streamsByMetal: {},
        },
        revenue: {
          masterN: 1,
          priceUSDByMetal: { Au: [10, 10] },
        },
        take: {
          masterN: 1,
          items: [],
        },
        phase1: {
          masterN: 1,
          productionStartPeriod: 0,
          operatingCostsUSD: [0, 0],
          sustainingCapexUSD: [0, 0],
          siteGandA_USD: [0, 0],
          reclamationUSD: [0, 0],
          capexUSD: [0, 0],
        },
        phase2: { discountRate: 0.1 },
        aisc: { auPriceUSDPerOz: [10] },
      }),
    /aisc.auPriceUSDPerOz length must equal masterN\+1/,
    'wrapper should validate AISC price series length',
  );

  console.log('Engine from production with streams wrapper tests passed');
})();
