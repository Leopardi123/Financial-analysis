import './terminalProceedsCashFlow.test.ts';
import '../jsonv3/__tests__/foundation.test.ts';
import { computeProjectPhase1 } from '../phase1.ts';
import { parseProjectJsonV1 } from '../jsonv1/parse.ts';
import { parseProjectJsonV1 as parseProjectJsonV1Legacy } from '../jsonv1/parseLegacy.ts';
import { getProjectJsonV1Template } from '../jsonv1/template.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}
function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
function assertThrows(fn: () => void, pattern: RegExp, message: string): void {
  let thrown: unknown;
  try { fn(); } catch (error) { thrown = error; }
  assert(thrown instanceof Error, `${message}. Expected function to throw`);
  assert(pattern.test((thrown as Error).message), `${message}. Error message did not match pattern`);
}

(function runExplicitTaxCashFlowTests() {
  const legacyJson = getProjectJsonV1Template();
  const legacyParsedBefore = parseProjectJsonV1Legacy(legacyJson);
  const legacyParsedAfter = parseProjectJsonV1(legacyJson);
  assertDeepEqual(legacyParsedAfter, legacyParsedBefore, 'JSON without new fields remains parser-equivalent');

  // Direct Phase1 support is retained for dedicated report-deck reconciliation/control runs.
  const reportControl = computeProjectPhase1({
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
  assertEqual(reportControl.taxUSD[0], 25, 'reconciliation engine can consume published cash tax');
  assertEqual(reportControl.fcffUSD[0], 75, 'published cash tax reduces reconciliation FCFF once');

  assertThrows(
    () => computeProjectPhase1({
      masterN: 0,
      productionStartPeriod: 0,
      taxRate: 0.27,
      taxCashFlowUSD: [-25],
      revenueUSD: [100], operatingCostsUSD: [0], sustainingCapexUSD: [0], siteGandA_USD: [0],
      royaltiesUSD: [0], reclamationUSD: [0], capexUSD: [0], workingCapitalDeltaUSD: [0],
    }),
    /taxCashFlowUSD is mutually exclusive with taxRate/,
    'one Phase1 invocation cannot double-tax',
  );

  // V2 compatibility: taxCashFlowUSD remains report evidence only. V3 removes this
  // dual representation and makes taxModel an explicit XOR canonical source.
  const evidenceJson = getProjectJsonV1Template();
  evidenceJson.economics.taxRate = 0.27;
  evidenceJson.series.taxCashFlowUSD = new Array(evidenceJson.time.masterN + 1).fill(0);
  evidenceJson.series.taxCashFlowUSD[0] = 10;
  evidenceJson.series.taxCashFlowUSD[2] = -20;
  const parsedEvidence = parseProjectJsonV1(evidenceJson);
  assertEqual(parsedEvidence.engineInput.phase1.taxCashFlowUSD, undefined, 'v2 report tax evidence must not enter priced runtime input');
  assertEqual(parsedEvidence.engineInputWithoutPrices.phase1.taxCashFlowUSD, undefined, 'v2 report tax evidence must not enter price-free runtime input');
  assertEqual(parsedEvidence.engineInputWithoutPrices.taxRate, 0.27, 'v2 dynamic runtime taxRate remains authoritative');

  const noDynamicTaxJson = getProjectJsonV1Template();
  noDynamicTaxJson.economics.taxRate = null;
  noDynamicTaxJson.series.taxCashFlowUSD = new Array(noDynamicTaxJson.time.masterN + 1).fill(-1);
  const parsedNoDynamicTax = parseProjectJsonV1(noDynamicTaxJson);
  assertEqual(parsedNoDynamicTax.engineInput.phase1.taxCashFlowUSD, undefined, 'v2 report tax evidence cannot silently become runtime tax');
  assertEqual(parsedNoDynamicTax.engineInputWithoutPrices.taxRate, null, 'missing v2 dynamic tax remains unverified rather than substituted');

  const shortTaxSeries = getProjectJsonV1Template();
  shortTaxSeries.series.taxCashFlowUSD = [0, 0];
  assertThrows(
    () => parseProjectJsonV1(shortTaxSeries),
    /series\.taxCashFlowUSD must be an array of length .*masterN\+1/,
    'v2 report tax evidence must match report timeline exactly',
  );

  const nonFiniteTaxSeries = getProjectJsonV1Template();
  nonFiniteTaxSeries.series.taxCashFlowUSD = new Array(nonFiniteTaxSeries.time.masterN + 1).fill(0);
  nonFiniteTaxSeries.series.taxCashFlowUSD[1] = Number.NaN;
  assertThrows(
    () => parseProjectJsonV1(nonFiniteTaxSeries),
    /series\.taxCashFlowUSD\[1\] must be null or a finite number/,
    'non-finite v2 report tax evidence is rejected',
  );

  console.log('Explicit tax cash-flow tests passed');
})();
