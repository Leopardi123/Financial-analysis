import { computeProjectEngineFromProduction } from '../engineFromProduction.ts';
import { computeProjectPhase1 } from '../phase1.ts';
import { computeProjectPhase2 } from '../phase2.ts';

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

(function runEngineFromProductionTests() {
  const output = computeProjectEngineFromProduction({
    revenue: {
      masterN: 2,
      payableQtyByMetal: {
        Au: [0, 1, 1],
        Ag: [0, 10, 10],
      },
      priceUSDByMetal: {
        Au: [2000, 2000, 2000],
        Ag: [25, 25, 25],
      },
    },
    take: {
      masterN: 2,
      items: [
        {
          id: 'nsr',
          base: { baseType: 'REVENUE' as const },
          rate: { rateType: 'FIXED' as const, value: 0.02 },
          appliesTo: { start_t: 0, end_t: 2 },
        },
      ],
    },
    phase1: {
      masterN: 2,
      productionStartPeriod: 1,
      operatingCostsUSD: [0, 500, 500],
      sustainingCapexUSD: [0, 50, 50],
      siteGandA_USD: [0, 20, 20],
      royaltiesUSD: [0, 0, 0],
      reclamationUSD: [0, 0, 0],
      capexUSD: [100, 0, 0],
      taxRate: 0.3,
    },
    phase2: {
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz: [2000, 2000, 2000],
    },
  });

  assertDeepEqual(output.revenue.grossRevenueUSD, [0, 2250, 2250], 'gross revenue should be composed from production');
  assertDeepEqual(output.take.netRevenueAfterTakeUSD, [0, 2205, 2205], 'take should run on revenue output');
  assertEqual(output.phase1.ebitUSD[1], 1635, 'phase1 EBIT at t=1 should use net revenue');

  const expectedPhase2 = computeProjectPhase2({
    masterN: 2,
    productionStartPeriod: 1,
    discountRate: 0.1,
    fcffUSD: output.phase1.fcffUSD,
  });

  assert(Number.isFinite(output.phase2.npvToday_USD as number), 'phase2 NPV should be finite');
  assertEqual(
    output.phase2.npvToday_USD,
    expectedPhase2.npvToday_USD,
    'phase2 output should match direct phase2 call on phase1 FCFF',
  );

  assertEqual(output.aisc.lomPeriods, 2, 'AISC LOM periods should include t=1 and t=2');
  assert(Number.isFinite(output.aisc.aiscAuEqUSDPerOz_LOM as number), 'AISC LOM value should be finite');

  const strictNullOutput = computeProjectEngineFromProduction({
    revenue: {
      masterN: 2,
      payableQtyByMetal: {
        Au: [0, 1, 1],
        Ag: [0, 10, 10],
      },
      priceUSDByMetal: {
        Au: [2000, 2000, 2000],
        Ag: [25, null, 25],
      },
    },
    take: {
      masterN: 2,
      items: [
        {
          id: 'nsr',
          base: { baseType: 'REVENUE' as const },
          rate: { rateType: 'FIXED' as const, value: 0.02 },
        },
      ],
    },
    phase1: {
      masterN: 2,
      productionStartPeriod: 1,
      operatingCostsUSD: [0, 500, 500],
      sustainingCapexUSD: [0, 50, 50],
      siteGandA_USD: [0, 20, 20],
      royaltiesUSD: [0, 0, 0],
      reclamationUSD: [0, 0, 0],
      capexUSD: [100, 0, 0],
      taxRate: 0.3,
    },
    phase2: {
      discountRate: 0.1,
    },
    aisc: {
      auPriceUSDPerOz: [2000, 2000, 2000],
    },
  });

  assertEqual(strictNullOutput.revenue.grossRevenueUSD[1], null, 'revenue should null-propagate at t=1');
  assertEqual(strictNullOutput.take.netRevenueAfterTakeUSD[1], null, 'take should null-propagate at t=1');

  const expectedPhase1WithNullRevenue = computeProjectPhase1({
    masterN: 2,
    productionStartPeriod: 1,
    revenueUSD: strictNullOutput.take.netRevenueAfterTakeUSD,
    operatingCostsUSD: [0, 500, 500],
    sustainingCapexUSD: [0, 50, 50],
    siteGandA_USD: [0, 20, 20],
    royaltiesUSD: [0, 0, 0],
    reclamationUSD: [0, 0, 0],
    capexUSD: [100, 0, 0],
    taxRate: 0.3,
  });

  assertDeepEqual(
    strictNullOutput.phase1.fcffUSD,
    expectedPhase1WithNullRevenue.fcffUSD,
    'phase1 should receive take net revenue including null values',
  );

  assertThrows(
    () =>
      computeProjectEngineFromProduction({
        revenue: {
          masterN: 2,
          payableQtyByMetal: { Au: [0, 1, 1] },
          priceUSDByMetal: { Au: [2000, 2000, 2000] },
        },
        take: {
          masterN: 1,
          items: [],
        },
        phase1: {
          masterN: 2,
          productionStartPeriod: 1,
          operatingCostsUSD: [0, 0, 0],
          sustainingCapexUSD: [0, 0, 0],
          siteGandA_USD: [0, 0, 0],
          royaltiesUSD: [0, 0, 0],
          reclamationUSD: [0, 0, 0],
          capexUSD: [0, 0, 0],
        },
        phase2: { discountRate: 0.1 },
        aisc: { auPriceUSDPerOz: [2000, 2000, 2000] },
      }),
    /revenue.masterN must match take.masterN/,
    'wrapper should validate masterN consistency',
  );

  assertThrows(
    () =>
      computeProjectEngineFromProduction({
        revenue: {
          masterN: 2,
          payableQtyByMetal: { Au: [0, 1, 1] },
          priceUSDByMetal: { Au: [2000, 2000, 2000] },
        },
        take: {
          masterN: 2,
          items: [],
        },
        phase1: {
          masterN: 2,
          productionStartPeriod: 1,
          operatingCostsUSD: [0, 0, 0],
          sustainingCapexUSD: [0, 0, 0],
          siteGandA_USD: [0, 0, 0],
          royaltiesUSD: [0, 0, 0],
          reclamationUSD: [0, 0, 0],
          capexUSD: [0, 0, 0],
        },
        phase2: { discountRate: 0.1 },
        aisc: { auPriceUSDPerOz: [2000, 2000] },
      }),
    /aisc.auPriceUSDPerOz length must equal masterN\+1/,
    'wrapper should validate AISC price series length',
  );

  console.log('Engine from production wrapper tests passed');
})();
