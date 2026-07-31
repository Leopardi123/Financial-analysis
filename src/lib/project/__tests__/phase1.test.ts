import { computeProjectPhase1 } from '../phase1.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
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

(function runPhase1Tests() {
  const happyPath = computeProjectPhase1({
    masterN: 3,
    productionStartPeriod: 2,
    taxRate: 0.3,
    revenueUSD: [0, 0, 100, 100],
    operatingCostsUSD: [10, 10, 40, 40],
    sustainingCapexUSD: [0, 0, 5, 5],
    siteGandA_USD: [2, 2, 2, 2],
    royaltiesUSD: [0, 0, 3, 3],
    reclamationUSD: [0, 0, 1, 1],
    byproductCreditsUSD: [0, 0, 0, 0],
    capexUSD: [50, 20, 0, 0],
  });

  assertDeepEqual(happyPath.sustainingCostUSD, [12, 12, 51, 51], 'happy path sustainingCostUSD');
  assertDeepEqual(happyPath.ebitdaUSD, [-12, -12, 54, 54], 'happy path informational EBITDA excludes sustaining CAPEX');
  assertDeepEqual(happyPath.sustainingAdjustedOperatingEarningsUSD, [-12, -12, 49, 49], 'happy path sustaining-adjusted operating earnings');
  assertDeepEqual(happyPath.ebitUSD, [-12, -12, 49, 49], 'happy path ebitUSD');
  assertDeepEqual(happyPath.taxUSD, [0, 0, 14.7, 14.7], 'happy path taxUSD');
  assertDeepEqual(happyPath.nopatUSD, [-12, -12, 34.3, 34.3], 'happy path nopatUSD');
  assertDeepEqual(happyPath.totalCapexUSD, [50, 20, 5, 5], 'happy path totalCapexUSD');
  assertDeepEqual(happyPath.fcffUSD, [-62, -32, 34.3, 34.3], 'happy path fcffUSD counts sustaining CAPEX and reclamation once through operating earnings');
  assertDeepEqual(happyPath.workingCapitalDeltaUSD_effective, [0, 0, 0, 0], 'happy path defaults working capital delta to zero');
  assert((happyPath.ebitUSD[0] as number) < 0, 'pre-production ebit at t=0 should be negative');
  assert((happyPath.ebitUSD[1] as number) < 0, 'pre-production ebit at t=1 should be negative');
  assertEqual(happyPath.taxUSD[0], 0, 'tax at t=0 should be zero for negative EBIT');
  assertEqual(happyPath.taxUSD[1], 0, 'tax at t=1 should be zero for negative EBIT');
  assertEqual(happyPath.fcffUSD[0], (happyPath.ebitUSD[0] as number) - 50, 'fcff at t=0');
  assertEqual(happyPath.fcffUSD[1], (happyPath.ebitUSD[1] as number) - 20, 'fcff at t=1');

  const nonFiniteInput = computeProjectPhase1({
    masterN: 3,
    productionStartPeriod: 2,
    taxRate: 0.3,
    revenueUSD: [0, 0, 100, 100],
    operatingCostsUSD: [10, 10, Number.NaN, 40],
    sustainingCapexUSD: [0, 0, 5, 5],
    siteGandA_USD: [2, 2, 2, 2],
    royaltiesUSD: [0, 0, 3, 3],
    reclamationUSD: [0, 0, 1, 1],
    byproductCreditsUSD: [0, 0, 0, 0],
    capexUSD: [50, 20, 0, 0],
  });

  assertEqual(nonFiniteInput.sustainingCostUSD[2], 11, 'non-finite op at t=2 should become 0 in sustaining cost');
  assertEqual(nonFiniteInput.ebitUSD[2], 89, 'non-finite op at t=2 should become 0 in ebit');
  assertEqual(nonFiniteInput.taxUSD[2], 26.7, 'tax at t=2 after non-finite op normalization');
  assertEqual(nonFiniteInput.nopatUSD[2], 62.3, 'nopat at t=2 after non-finite op normalization');
  assertEqual(nonFiniteInput.totalCapexUSD[2], 5, 'total capex at t=2 after non-finite op normalization');
  assertEqual(nonFiniteInput.fcffUSD[2], 62.3, 'fcff at t=2 after non-finite op normalization');

  const definitionCase = (sustainingCapex: number, initialCapex = 0) => computeProjectPhase1({
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: 0.25,
    revenueUSD: [100],
    operatingCostsUSD: [40],
    sustainingCapexUSD: [sustainingCapex],
    siteGandA_USD: [5],
    royaltiesUSD: [3],
    reclamationUSD: [2],
    byproductCreditsUSD: [4],
    depreciationUSD: [6],
    capexUSD: [initialCapex],
    workingCapitalDeltaUSD: [0],
  });
  const withoutSustaining = definitionCase(0);
  const withSustaining = definitionCase(10);
  assertEqual(withSustaining.ebitdaUSD[0], 54, 'true EBITDA excludes sustaining CAPEX');
  assertEqual(withSustaining.sustainingAdjustedOperatingEarningsUSD[0], 44, 'renamed operating metric deducts sustaining CAPEX');
  assertEqual(withSustaining.ebitUSD[0], 38, 'EBIT continues from sustaining-adjusted operating earnings');
  assertEqual(withSustaining.taxUSD[0], 9.5, 'tax is 25% of EBIT after sustaining CAPEX');
  assertEqual(withoutSustaining.fcffUSD[0], 42, 'FCFF before sustaining CAPEX sensitivity');
  assertEqual(withSustaining.fcffUSD[0], 34.5, 'FCFF deducts sustaining CAPEX exactly once through after-tax operating earnings');
  assertEqual((withoutSustaining.fcffUSD[0] as number) - (withSustaining.fcffUSD[0] as number), 7.5, 'a 10 sustaining CAPEX increase reduces FCFF by 10 less the 2.5 tax shield');
  assertEqual(definitionCase(10, 7).fcffUSD[0], 27.5, 'initial CAPEX remains a separate full FCFF deduction');

  assertThrows(
    () =>
      computeProjectPhase1({
        masterN: 0,
        productionStartPeriod: 0,
        revenueUSD: [0],
        operatingCostsUSD: [0],
        sustainingCapexUSD: [0],
        siteGandA_USD: [0],
        royaltiesUSD: [0],
        reclamationUSD: [0],
        capexUSD: [-10],
      }),
    /capexUSD must be non-negative spend/,
    'negative capex should throw',
  );

  const nullCapex = computeProjectPhase1({
    masterN: 1,
    productionStartPeriod: 0,
    revenueUSD: [100, 100],
    operatingCostsUSD: [10, 10],
    sustainingCapexUSD: [5, 5],
    siteGandA_USD: [2, 2],
    royaltiesUSD: [1, 1],
    reclamationUSD: [1, 1],
    capexUSD: [0, null],
    taxRate: 0.3,
  });

  assertEqual(nullCapex.ebitUSD[1], 81, 'ebit should still compute when capex is null');
  assertEqual(nullCapex.nopatUSD[1], 56.7, 'nopat should still compute when capex is null');
  assertEqual(nullCapex.fcffUSD[1], null, 'fcff should be null when capex is null');



  const positiveWorkingCapital = computeProjectPhase1({
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: 0,
    revenueUSD: [100],
    operatingCostsUSD: [0],
    sustainingCapexUSD: [0],
    siteGandA_USD: [0],
    royaltiesUSD: [0],
    reclamationUSD: [0],
    byproductCreditsUSD: [0],
    capexUSD: [0],
    workingCapitalDeltaUSD: [30],
  });
  assertEqual(positiveWorkingCapital.fcffUSD[0], 70, 'positive working capital delta should reduce fcff');

  const negativeWorkingCapital = computeProjectPhase1({
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: 0,
    revenueUSD: [100],
    operatingCostsUSD: [0],
    sustainingCapexUSD: [0],
    siteGandA_USD: [0],
    royaltiesUSD: [0],
    reclamationUSD: [0],
    byproductCreditsUSD: [0],
    capexUSD: [0],
    workingCapitalDeltaUSD: [-30],
  });
  assertEqual(negativeWorkingCapital.fcffUSD[0], 130, 'negative working capital delta should increase fcff');

  assertThrows(
    () =>
      computeProjectPhase1({
        masterN: 1,
        productionStartPeriod: 0,
        revenueUSD: [100, 100],
        operatingCostsUSD: [10],
        sustainingCapexUSD: [5, 5],
        siteGandA_USD: [2, 2],
        royaltiesUSD: [1, 1],
        reclamationUSD: [1, 1],
        capexUSD: [0, 0],
      }),
    /operatingCostsUSD length must equal masterN\+1/,
    'length mismatch should throw',
  );

  console.log('Phase1 tests passed');
})();
