import { computeProjectPhase1 } from '../phase1.ts';
import { parseProjectJsonV1 } from '../jsonv1/parse.ts';
import { parseProjectJsonV1 as parseProjectJsonV1Legacy } from '../jsonv1/parseLegacy.ts';
import { getProjectJsonV1Template } from '../jsonv1/template.ts';

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

(function runExplicitTaxCashFlowTests() {
  // Hard non-regression guard: when the new field is absent, the new parser
  // must return the exact same canonical inputs/context/warnings as the parser
  // that existed before this feature branch.
  const legacyJson = getProjectJsonV1Template();
  const legacyParsedBefore = parseProjectJsonV1Legacy(legacyJson);
  const legacyParsedAfter = parseProjectJsonV1(legacyJson);
  assertDeepEqual(
    legacyParsedAfter,
    legacyParsedBefore,
    'project JSON without taxCashFlowUSD must remain bit-for-bit parser-equivalent',
  );

  const creditCase = computeProjectPhase1({
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: null,
    taxCashFlowUSD: [30],
    revenueUSD: [0],
    operatingCostsUSD: [0],
    sustainingCapexUSD: [0],
    siteGandA_USD: [0],
    royaltiesUSD: [0],
    reclamationUSD: [0],
    depreciationUSD: [0],
    capexUSD: [100],
    workingCapitalDeltaUSD: [0],
  });
  assertEqual(creditCase.ebitdaUSD[0], 0, 'tax credit must not change EBITDA');
  assertEqual(creditCase.ebitUSD[0], 0, 'tax credit must not change EBIT');
  assertEqual(creditCase.taxUSD[0], -30, 'positive explicit tax cash flow is exposed as a negative tax expense/credit');
  assertEqual(creditCase.fcffUSD[0], -70, 'positive refundable tax credit increases FCFF directly');

  const paymentCase = computeProjectPhase1({
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: null,
    taxCashFlowUSD: [-25],
    revenueUSD: [100],
    operatingCostsUSD: [0],
    sustainingCapexUSD: [0],
    siteGandA_USD: [0],
    royaltiesUSD: [0],
    reclamationUSD: [0],
    depreciationUSD: [0],
    capexUSD: [0],
    workingCapitalDeltaUSD: [0],
  });
  assertEqual(paymentCase.ebitdaUSD[0], 100, 'cash tax payment must not change EBITDA');
  assertEqual(paymentCase.taxUSD[0], 25, 'negative explicit tax cash flow is exposed as positive tax payment');
  assertEqual(paymentCase.fcffUSD[0], 75, 'cash tax payment reduces FCFF exactly once');

  const nullTaxCase = computeProjectPhase1({
    masterN: 0,
    productionStartPeriod: 0,
    taxRate: null,
    taxCashFlowUSD: [null],
    revenueUSD: [100],
    operatingCostsUSD: [0],
    sustainingCapexUSD: [0],
    siteGandA_USD: [0],
    royaltiesUSD: [0],
    reclamationUSD: [0],
    capexUSD: [0],
  });
  assertEqual(nullTaxCase.fcffUSD[0], null, 'null explicit tax remains unverified and must not silently become zero');

  assertThrows(
    () => computeProjectPhase1({
      masterN: 0,
      productionStartPeriod: 0,
      taxRate: 0.27,
      taxCashFlowUSD: [-25],
      revenueUSD: [100],
      operatingCostsUSD: [0],
      sustainingCapexUSD: [0],
      siteGandA_USD: [0],
      royaltiesUSD: [0],
      reclamationUSD: [0],
      capexUSD: [0],
    }),
    /taxCashFlowUSD is mutually exclusive with taxRate/,
    'direct engine input must reject double-tax configuration',
  );

  const explicitJson = getProjectJsonV1Template();
  explicitJson.economics.taxRate = null;
  explicitJson.series.taxCashFlowUSD = new Array(explicitJson.time.masterN + 1).fill(0);
  explicitJson.series.taxCashFlowUSD[0] = 10;
  explicitJson.series.taxCashFlowUSD[2] = -20;
  const parsedExplicit = parseProjectJsonV1(explicitJson);
  assertDeepEqual(
    parsedExplicit.engineInput.phase1.taxCashFlowUSD,
    explicitJson.series.taxCashFlowUSD,
    'parser carries signed report-locked tax cash flow to canonical engine input',
  );
  assertDeepEqual(
    parsedExplicit.engineInputWithoutPrices.phase1.taxCashFlowUSD,
    explicitJson.series.taxCashFlowUSD,
    'price-free canonical input carries same explicit tax series',
  );

  const conflictJson = getProjectJsonV1Template();
  conflictJson.economics.taxRate = 0.27;
  conflictJson.series.taxCashFlowUSD = new Array(conflictJson.time.masterN + 1).fill(-1);
  assertThrows(
    () => parseProjectJsonV1(conflictJson),
    /series\.taxCashFlowUSD is mutually exclusive with economics\.taxRate/,
    'project JSON parser rejects taxRate plus explicit tax series',
  );

  const shortTaxSeries = getProjectJsonV1Template();
  shortTaxSeries.economics.taxRate = null;
  shortTaxSeries.series.taxCashFlowUSD = [0, 0];
  assertThrows(
    () => parseProjectJsonV1(shortTaxSeries),
    /series\.taxCashFlowUSD must be an array of length .*masterN\+1/,
    'report-locked tax series must match the report timeline exactly and is never padded',
  );

  const nonFiniteTaxSeries = getProjectJsonV1Template();
  nonFiniteTaxSeries.economics.taxRate = null;
  nonFiniteTaxSeries.series.taxCashFlowUSD = new Array(nonFiniteTaxSeries.time.masterN + 1).fill(0);
  nonFiniteTaxSeries.series.taxCashFlowUSD[1] = Number.NaN;
  assertThrows(
    () => parseProjectJsonV1(nonFiniteTaxSeries),
    /series\.taxCashFlowUSD\[1\] must be null or a finite number/,
    'non-finite explicit tax values are rejected rather than normalized',
  );

  console.log('Explicit tax cash-flow tests passed');
})();
