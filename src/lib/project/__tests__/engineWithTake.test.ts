import { computeProjectEngineWithTake } from '../engineWithTake.ts';
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

(function runEngineWithTakeTests() {
  const masterN = 3;
  const productionStartPeriod = 1;
  const grossRevenueUSD = [0, 100, 100, 50];

  const input = {
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
      productionStartPeriod,
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
  };

  const output = computeProjectEngineWithTake(input);

  assertDeepEqual(output.take.netRevenueAfterTakeUSD, [0, 93, 93, 49], 'take net revenue should match expected');

  const expectedEbitT1 = 93 - 40 - 5 - 2 - 3 - 1;
  const expectedEbitT2 = 93 - 40 - 5 - 2 - 3 - 1;
  assertEqual(output.phase1.ebitUSD[1], expectedEbitT1, 'phase1 ebit at t=1 should use net revenue');
  assertEqual(output.phase1.ebitUSD[2], expectedEbitT2, 'phase1 ebit at t=2 should use net revenue');

  const phase2Direct = computeProjectPhase2({
    masterN,
    productionStartPeriod,
    discountRate: input.phase2.discountRate,
    fcffUSD: output.phase1.fcffUSD,
  });
  assertEqual(output.phase2.npvToday_USD, phase2Direct.npvToday_USD, 'phase2 npvToday should match direct phase2 output');

  const nullInput = {
    ...input,
    take: {
      ...input.take,
      grossRevenueUSD: [0, 100, null, 50] as (number | null)[],
    },
    phase1: {
      ...input.phase1,
      grossRevenueUSD: [0, 100, null, 50] as (number | null)[],
    },
  };

  const nullOutput = computeProjectEngineWithTake(nullInput);
  assertEqual(nullOutput.take.netRevenueAfterTakeUSD[2], null, 'take should preserve null in net revenue at t=2');
  assertEqual(nullOutput.phase1.ebitUSD[2], -51, 'phase1 should receive null revenue and apply existing null=>0 semantics at t=2');

  assertThrows(
    () =>
      computeProjectEngineWithTake({
        ...input,
        phase1: {
          ...input.phase1,
          grossRevenueUSD: [0, 100, 90, 50],
        },
      }),
    /phase1.grossRevenueUSD must match take.grossRevenueUSD values/,
    'wrapper should throw when phase1 gross revenue differs from take gross revenue',
  );

  console.log('Engine with take wrapper tests passed');
})();
