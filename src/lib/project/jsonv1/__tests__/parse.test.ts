import { parseProjectJsonV1 } from '../parse.ts';
import { getProjectJsonV1Template } from '../template.ts';

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

(function runParseProjectJsonV1Tests() {
  const happy = getProjectJsonV1Template();
  happy.metals.payableQtyByMetal.Au[2] = 100;
  happy.series.operatingCostsUSD[2] = 400;
  happy.series.capexUSD[0] = -1000;

  const parsed = parseProjectJsonV1(happy);
  assertEqual(parsed.engineInputWithoutPrices.payableQtyByMetal.Au[2], 100, 'happy path payable qty');
  assertEqual(parsed.engineInputWithoutPrices.phase1.capexUSD[0], 1000, 'negative capex normalized to spend');
  assert(parsed.warnings.includes('capexUSD: detected negative values; normalized to spend (abs).'), 'negative capex warning emitted');
  assertEqual(parsed.engineInputWithoutPrices.priceKeyByMetal.Au, 'XAU_USD_TOZ', 'price key parsed');
  assertEqual(parsed.engineInputWithoutPrices.payableQtyUnitByMetal.Au, 'toz', 'qty unit parsed');
  assertEqual(parsed.engineInputWithoutPrices.auPriceKey, 'XAU_USD_TOZ', 'au price key parsed');
  assert(parsed.context.operations != null, 'happy path context operations should be present');
  assertEqual(parsed.context.equity?.fdExtraShares, 0, 'fd extra shares defaults to 0 when omitted');

  const withFdEquity = getProjectJsonV1Template();
  withFdEquity.equity = { fdExtraShares: 125, fdNotes: 'options + warrants' };
  const parsedWithFdEquity = parseProjectJsonV1(withFdEquity);
  assertEqual(parsedWithFdEquity.context.equity?.fdExtraShares, 125, 'fd extra shares parsed when provided');
  assertEqual(parsedWithFdEquity.context.equity?.fdNotes, 'options + warrants', 'fd notes parsed when provided');

  const wrongVersion = getProjectJsonV1Template();
  (wrongVersion as { version: string }).version = 'wrong';
  assertThrows(() => parseProjectJsonV1(wrongVersion), /version/, 'throws on wrong version');

  const badMasterN = getProjectJsonV1Template();
  (badMasterN.time as { masterN: number | string }).masterN = 1.2;
  assertThrows(() => parseProjectJsonV1(badMasterN), /time\.masterN/, 'throws on non-integer masterN');

  const badSeriesLength = getProjectJsonV1Template();
  badSeriesLength.series.capexUSD = [1, 2, 3];
  assertThrows(() => parseProjectJsonV1(badSeriesLength), /series\.capexUSD/, 'throws on required series length mismatch');


  const workingCapitalSeries = getProjectJsonV1Template();
  workingCapitalSeries.series.workingCapitalDeltaUSD = new Array(workingCapitalSeries.time.masterN + 1).fill(10);
  workingCapitalSeries.series.workingCapitalDeltaUSD[2] = Number.NaN;
  const parsedWorkingCapital = parseProjectJsonV1(workingCapitalSeries);
  assertEqual(parsedWorkingCapital.engineInputWithoutPrices.phase1.workingCapitalDeltaUSD?.[0], 10, 'working capital series is carried to engine input');
  assertEqual(parsedWorkingCapital.engineInputWithoutPrices.phase1.workingCapitalDeltaUSD?.[2], null, 'working capital non-finite values sanitize to null');

  const badWorkingCapitalLength = getProjectJsonV1Template();
  badWorkingCapitalLength.series.workingCapitalDeltaUSD = [1, 2, 3];
  assertThrows(
    () => parseProjectJsonV1(badWorkingCapitalLength),
    /series\.workingCapitalDeltaUSD/,
    'throws on optional working capital length mismatch',
  );


  const badPeriodEndDatesLength = getProjectJsonV1Template();
  badPeriodEndDatesLength.time.periodEndDatesUtc = ['2026-12-31'];
  assertThrows(
    () => parseProjectJsonV1(badPeriodEndDatesLength),
    /time\.periodEndDatesUtc/,
    'throws on periodEndDatesUtc length mismatch',
  );

  const badPeriodEndDatesOrder = getProjectJsonV1Template();
  badPeriodEndDatesOrder.time.periodEndDatesUtc = [
    '2026-12-31',
    '2027-12-31',
    '2027-12-31',
    '2029-12-31',
    '2030-12-31',
    '2031-12-31',
  ];
  assertThrows(
    () => parseProjectJsonV1(badPeriodEndDatesOrder),
    /time\.periodEndDatesUtc/,
    'throws on non-increasing periodEndDatesUtc',
  );

  const metalMismatchUnits = getProjectJsonV1Template();
  metalMismatchUnits.metals.payableQtyUnitByMetal = { Au: 'toz' };
  assertThrows(() => parseProjectJsonV1(metalMismatchUnits), /payableQtyUnitByMetal/, 'throws on payable/unit metal mismatch');

  const metalMismatchPrices = getProjectJsonV1Template();
  metalMismatchPrices.metals.priceKeyByMetal = { Au: 'XAU_USD_TOZ' };
  assertThrows(() => parseProjectJsonV1(metalMismatchPrices), /priceKeyByMetal/, 'throws on payable/price-key mismatch');

  const negativeQty = getProjectJsonV1Template();
  negativeQty.metals.payableQtyByMetal.Au[1] = -1;
  assertThrows(() => parseProjectJsonV1(negativeQty), /payableQtyByMetal\.Au\[1\]/, 'throws on negative payable qty');

  const legacy = getProjectJsonV1Template();
  legacy.metals.spotPriceUSDByMetal = { Au: new Array(legacy.time.masterN + 1).fill(10), Cu: new Array(legacy.time.masterN + 1).fill(4) };
  legacy.metals.auPriceUSDPerOz = new Array(legacy.time.masterN + 1).fill(1999);
  const parsedLegacy = parseProjectJsonV1(legacy);
  assertEqual(parsedLegacy.priceOverrides.spotPriceUSDByMetal?.Au[0], 10, 'legacy spot price carried as override');
  assertEqual(parsedLegacy.priceOverrides.auPriceUSDPerOz?.[0], 1999, 'legacy au price carried as override');

  const positiveCapex = getProjectJsonV1Template();
  positiveCapex.series.capexUSD = [100, 0, 0, 5, 8, 10];
  const parsedPositiveCapex = parseProjectJsonV1(positiveCapex);
  assertEqual(parsedPositiveCapex.engineInputWithoutPrices.phase1.capexUSD[0], 100, 'positive capex remains unchanged');
  assertEqual(parsedPositiveCapex.warnings.length, 0, 'positive capex has no normalization warning');

  const mixedNullCapex = getProjectJsonV1Template();
  mixedNullCapex.series.capexUSD = [null, -25, null, 0, -5, null];
  mixedNullCapex.series.sustainingCapexUSD = [null, -1, 2, null, -3, null];
  const parsedMixedNullCapex = parseProjectJsonV1(mixedNullCapex);
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.capexUSD[0], null, 'capex null preserved at index 0');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.capexUSD[1], 25, 'capex negative normalized with nulls preserved');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.capexUSD[5], null, 'capex trailing null preserved');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.sustainingCapexUSD[0], null, 'sustaining capex null preserved at index 0');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.sustainingCapexUSD[1], 1, 'sustaining capex negative normalized with nulls preserved');
  assertEqual(parsedMixedNullCapex.engineInputWithoutPrices.phase1.sustainingCapexUSD[5], null, 'sustaining capex trailing null preserved');
  assert(parsedMixedNullCapex.warnings.includes('capexUSD: detected negative values; normalized to spend (abs).'), 'mixed null capex warning emitted');
  assert(parsedMixedNullCapex.warnings.includes('sustainingCapexUSD: detected negative values; normalized to spend (abs).'), 'mixed null sustaining capex warning emitted');


  const withBreakdown = getProjectJsonV1Template();
  withBreakdown.series.siteGandA_USD = new Array(withBreakdown.time.masterN + 1).fill(null);
  withBreakdown.economicsBreakdown = {
    cogs: {
      miningUSD: new Array(withBreakdown.time.masterN + 1).fill(10),
      siteGandA_USD: new Array(withBreakdown.time.masterN + 1).fill(5),
    },
    selling: {
      tcRcUSD: new Array(withBreakdown.time.masterN + 1).fill(3),
      transportUSD: new Array(withBreakdown.time.masterN + 1).fill(2),
    },
    royaltiesDetail: [
      {
        id: 'roy1',
        label: 'NSR',
        base: 'revenue',
        rate: 0.01,
      },
    ],
    taxesDetail: {
      federalIncomeTaxUSD: new Array(withBreakdown.time.masterN + 1).fill(1),
    },
  };
  const parsedBreakdown = parseProjectJsonV1(withBreakdown);
  assertEqual(parsedBreakdown.context.economicsBreakdown?.cogs?.miningUSD?.[0], 10, 'economics breakdown mining parsed');

  const sparseOperations = getProjectJsonV1Template();
  if (sparseOperations.operations == null) {
    throw new Error('template.operations must be present');
  }
  sparseOperations.operations.oreMilledTonnes = [10, 20];
  const parsedSparseOperations = parseProjectJsonV1(sparseOperations);
  assertEqual(parsedSparseOperations.context.operations?.oreMilledTonnes?.length, 6, 'sparse operations series padded to masterN+1');
  assertEqual(parsedSparseOperations.context.operations?.oreMilledTonnes?.[0], 10, 'sparse operations first value preserved');
  assertEqual(parsedSparseOperations.context.operations?.oreMilledTonnes?.[5], null, 'sparse operations trailing values padded with null');

  const sparseBreakdown = getProjectJsonV1Template();
  sparseBreakdown.series.siteGandA_USD = new Array(sparseBreakdown.time.masterN + 1).fill(null);
  sparseBreakdown.economicsBreakdown = {
    cogs: {
      miningUSD: [1, 2, 3],
    },
  };
  const parsedSparseBreakdown = parseProjectJsonV1(sparseBreakdown);
  assertEqual(parsedSparseBreakdown.context.economicsBreakdown?.cogs?.miningUSD?.length, 6, 'sparse economics breakdown series padded to masterN+1');
  assertEqual(parsedSparseBreakdown.context.economicsBreakdown?.cogs?.miningUSD?.[2], 3, 'sparse economics breakdown value preserved');
  assertEqual(parsedSparseBreakdown.context.economicsBreakdown?.cogs?.miningUSD?.[5], null, 'sparse economics breakdown trailing values padded');

  const tooLongSparseBreakdown = getProjectJsonV1Template();
  tooLongSparseBreakdown.economicsBreakdown = {
    cogs: {
      miningUSD: [1, 2, 3, 4, 5, 6, 7],
    },
  };
  assertThrows(
    () => parseProjectJsonV1(tooLongSparseBreakdown),
    /economicsBreakdown\.cogs\.miningUSD length 7 exceeds expected max length 6/,
    'throws on sparse series longer than masterN+1 with path and expected max length',
  );

  const breakdownMetadata = getProjectJsonV1Template();
  breakdownMetadata.economicsBreakdown = {
    royaltiesDetail: [
      {
        id: 'roy-meta',
        label: 'Audited FS Royalty',
        base: 'revenue',
        rate: 0.02,
        source: 'FS',
        notes: 'from audited FS',
      },
    ],
  };
  const parsedBreakdownMetadata = parseProjectJsonV1(breakdownMetadata);
  assertEqual(parsedBreakdownMetadata.context.economicsBreakdown?.royaltiesDetail?.[0]?.source, 'FS', 'royalties metadata source accepted');
  assertEqual(parsedBreakdownMetadata.context.economicsBreakdown?.royaltiesDetail?.[0]?.notes, 'from audited FS', 'royalties metadata notes accepted');

  const duplicateSiteGanda = getProjectJsonV1Template();
  duplicateSiteGanda.series.siteGandA_USD[1] = 9;
  duplicateSiteGanda.economicsBreakdown = {
    cogs: {
      siteGandA_USD: new Array(duplicateSiteGanda.time.masterN + 1).fill(1),
    },
  };
  assertThrows(() => parseProjectJsonV1(duplicateSiteGanda), /economicsBreakdown\.cogs\.siteGandA_USD/, 'throws on siteGandA duplication');

  const invalidOperations = getProjectJsonV1Template();
  if (invalidOperations.operations == null) {
    throw new Error('template.operations must be present');
  }
  invalidOperations.operations.capacity.nameplateThroughput = 0;
  assertThrows(
    () => parseProjectJsonV1(invalidOperations),
    /operations\.capacity\.nameplateThroughput/,
    'throws on invalid operations capacity',
  );

  console.log('Project JSON v1 parse tests passed');
})();
