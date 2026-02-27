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
  assertEqual(parsed.engineInputWithoutPrices.phase1.capexUSD[0], -1000, 'happy path capex passthrough');
  assertEqual(parsed.engineInputWithoutPrices.priceKeyByMetal.Au, 'XAU_USD_TOZ', 'price key parsed');
  assertEqual(parsed.engineInputWithoutPrices.payableQtyUnitByMetal.Au, 'toz', 'qty unit parsed');
  assertEqual(parsed.engineInputWithoutPrices.auPriceKey, 'XAU_USD_TOZ', 'au price key parsed');
  assert(parsed.context.operations != null, 'happy path context operations should be present');

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

  const badBreakdownLength = getProjectJsonV1Template();
  badBreakdownLength.economicsBreakdown = {
    cogs: {
      miningUSD: [1, 2],
    },
  };
  assertThrows(() => parseProjectJsonV1(badBreakdownLength), /economicsBreakdown\.cogs\.miningUSD/, 'throws on economics breakdown length mismatch');

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
