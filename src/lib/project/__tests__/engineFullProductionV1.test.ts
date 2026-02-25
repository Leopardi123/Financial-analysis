import { computeProjectEngineFullProductionV1 } from '../engineFullProductionV1.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertAlmostEqual(actual: number | null, expected: number, message: string, tolerance = 1e-9): void {
  assert(actual !== null, `${message}. Expected non-null value`);
  if (Math.abs((actual as number) - expected) > tolerance) {
    throw new Error(`${message}. Expected ${expected}, received ${String(actual)}`);
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

(function runEngineFullProductionV1Tests() {
  const happyPath = computeProjectEngineFullProductionV1({
    masterN: 0,
    streamsByMetal: {
      Au: {
        streamPctOfPayable: 0.1,
        purchasePrice: {
          kind: 'FIXED_USD_PER_UNIT',
          value: 2,
        },
      },
    },
    payableQtyByMetal: {
      Au: [100],
    },
    spotPriceUSDByMetal: {
      Au: [10],
    },
    takeItems: [
      {
        id: 'nsr-5pct',
        base: { baseType: 'REVENUE' },
        rate: { rateType: 'FIXED', value: 0.05 },
      },
      {
        id: 'profit-duty-10pct',
        base: { baseType: 'OPERATING_PROFIT' },
        rate: { rateType: 'FIXED', value: 0.1 },
      },
    ],
    phase1: {
      masterN: 0,
      productionStartPeriod: 0,
      taxRate: 0,
      capexUSD: [0],
      operatingCostsUSD: [400],
      sustainingCapexUSD: [0],
      siteGandA_USD: [0],
      reclamationUSD: [0],
    },
    phase2: {
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz: [10],
    },
  });

  assert(happyPath.streams !== null, 'streams should be returned when streamsByMetal is provided');
  assertDeepEqual(happyPath.streams?.effectivePayableQtyByMetal.Au, [90], 'effective payable qty should include stream delivery');
  assertDeepEqual(happyPath.streams?.streamTakeUSD_total, [80], 'stream take should be included');
  assertDeepEqual(happyPath.revenue.grossRevenueUSD, [900], 'revenue should use effective payable quantity');

  assertAlmostEqual(happyPath.nationalTake.revenueTakeUSD[0], 45, 'revenue take should be 5% of gross revenue');
  assertAlmostEqual(happyPath.nationalTake.netRevenueAfterRevenueTakeUSD[0], 855, 'net revenue should be gross less revenue take');
  assertAlmostEqual(happyPath.nationalTake.profitTakeUSD[0], 45.5, 'profit take should be 10% of operating profit pre-duty');
  assertAlmostEqual(happyPath.nationalTake.totalTakeUSD[0], 90.5, 'total take should be revenue+profit takes');
  assertAlmostEqual(happyPath.nationalTake.totalRoyaltiesUSD[0], 170.5, 'total royalties should include stream take');
  assertAlmostEqual(happyPath.phase1.ebitUSD[0], 284.5, 'final EBIT should include total royalties with stream take');
  assertDeepEqual(happyPath.capexUSD_used, [0], 'engine should expose capex series used by phase1');

  const noStreams = computeProjectEngineFullProductionV1({
    masterN: 0,
    streamsByMetal: null,
    payableQtyByMetal: {
      Au: [100],
    },
    spotPriceUSDByMetal: {
      Au: [10],
    },
    takeItems: [],
    phase1: {
      masterN: 0,
      productionStartPeriod: 0,
      taxRate: 0,
      capexUSD: [0],
      operatingCostsUSD: [100],
      sustainingCapexUSD: [0],
      siteGandA_USD: [0],
      reclamationUSD: [0],
    },
    phase2: {
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz: [10],
    },
  });

  assertEqual(noStreams.streams, null, 'streams should be null when streamsByMetal is not provided');
  assertDeepEqual(noStreams.nationalTake.totalRoyaltiesUSD, [0], 'extra royalties should default to zero series when no streams');

  assertThrows(
    () =>
      computeProjectEngineFullProductionV1({
        masterN: 1,
        payableQtyByMetal: { Au: [100, 100] },
        spotPriceUSDByMetal: { Au: [10, 10] },
        takeItems: [],
        phase1: {
          masterN: 1,
          productionStartPeriod: 0,
          capexUSD: [0, 0],
          operatingCostsUSD: [0, 0],
          sustainingCapexUSD: [0, 0],
          siteGandA_USD: [0, 0],
          reclamationUSD: [0, 0],
        },
        phase2: { discountRate: 0.1 },
        aisc: { auPriceUSDPerOz: [10] },
      }),
    /aisc.auPriceUSDPerOz length must equal masterN\+1/,
    'engine should validate auPrice length',
  );

  assertThrows(
    () =>
      computeProjectEngineFullProductionV1({
        masterN: 0,
        streamsByMetal: {
          Ag: {
            streamPctOfPayable: 0.1,
            purchasePrice: { kind: 'FIXED_USD_PER_UNIT', value: 1 },
          },
        },
        payableQtyByMetal: { Au: [100] },
        spotPriceUSDByMetal: { Au: [10] },
        takeItems: [],
        phase1: {
          masterN: 0,
          productionStartPeriod: 0,
          capexUSD: [0],
          operatingCostsUSD: [0],
          sustainingCapexUSD: [0],
          siteGandA_USD: [0],
          reclamationUSD: [0],
        },
        phase2: { discountRate: 0.1 },
        aisc: { auPriceUSDPerOz: [10] },
      }),
    /streamsByMetal references unknown payable metal Ag/,
    'engine should surface stream unknown metal validation',
  );

  console.log('Engine full production v1 tests passed');
})();
