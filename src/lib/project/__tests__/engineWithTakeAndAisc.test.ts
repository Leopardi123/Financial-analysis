import { computeProjectEngineWithTakeAndAisc } from '../engineWithTakeAndAisc.ts';

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

(function runEngineWithTakeAndAiscTests() {
  const masterN = 3;
  const grossRevenueUSD = [0, 100, 100, 50];

  const output = computeProjectEngineWithTakeAndAisc({
    engineWithTake: {
      take: {
        masterN,
        grossRevenueUSD,
        items: [
          {
            id: 'nsr',
            base: { baseType: 'REVENUE' as const },
            rate: { rateType: 'FIXED' as const, value: 0.02 },
          },
          {
            id: 'gov',
            appliesTo: { start_t: 1, end_t: 2 },
            base: { baseType: 'REVENUE' as const },
            rate: { rateType: 'FIXED' as const, value: 0.05 },
          },
        ],
      },
      phase1: {
        masterN,
        productionStartPeriod: 1,
        taxRate: 0.3,
        grossRevenueUSD,
        operatingCostsUSD: [0, 40, 40, 20],
        sustainingCapexUSD: [0, 5, 5, 3],
        siteGandA_USD: [0, 2, 2, 1],
        royaltiesUSD: [0, 3, 3, 1],
        reclamationUSD: [0, 1, 1, 1],
        byproductCreditsUSD: [0, 0, 0, 0],
        capexUSD: [10, 0, 0, 0],
      },
      phase2: {
        discountRate: 0.1,
      },
    },
    aisc: {
      grossRevenueUSD,
      auPriceUSDPerOz: [2000, 2000, 2000, 2000],
    },
  });

  assert(output.take != null, 'take output should exist');
  assertEqual(output.phase1.ebitUSD[1], 42, 'phase1 should use netRevenueAfterTake in EBIT at t=1');
  assertEqual(output.phase1.sustainingCostUSD[1], 51, 'phase1 sustainingCost should flow into AISC input');
  assertEqual(output.aisc.payableAuEqOz[1], 0.05, 'AISC payable AuEq should use gross revenue basis at t=1');
  assertEqual(output.aisc.aiscAuEqUSDPerOz_LOM, 1024, 'AISC output should match expected value');

  assertThrows(
    () =>
      computeProjectEngineWithTakeAndAisc({
        engineWithTake: {
          take: {
            masterN,
            grossRevenueUSD,
            items: [],
          },
          phase1: {
            masterN,
            productionStartPeriod: 1,
            grossRevenueUSD,
            operatingCostsUSD: [0, 0, 0, 0],
            sustainingCapexUSD: [0, 0, 0, 0],
            siteGandA_USD: [0, 0, 0, 0],
            royaltiesUSD: [0, 0, 0, 0],
            reclamationUSD: [0, 0, 0, 0],
            byproductCreditsUSD: [0, 0, 0, 0],
            capexUSD: [0, 0, 0, 0],
          },
          phase2: { discountRate: 0.1 },
        },
        aisc: {
          grossRevenueUSD: [0, 100, 99, 50],
          auPriceUSDPerOz: [2000, 2000, 2000, 2000],
        },
      }),
    /aisc.grossRevenueUSD must match engineWithTake.take.grossRevenueUSD values/,
    'wrapper should throw when AISC gross revenue differs from take gross revenue',
  );

  console.log('Engine with take and AISC wrapper tests passed');
})();
