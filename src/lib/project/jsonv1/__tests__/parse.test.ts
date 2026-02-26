import { parseProjectJsonV1, parseProjectJsonV1WithContext } from '../parse.ts';
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
  happy.metals.spotPriceUSDByMetal.Au[2] = 10;
  happy.metals.auPriceUSDPerOz[2] = 10;
  happy.series.operatingCostsUSD[2] = 400;
  happy.series.capexUSD[0] = -1000;

  const engineInput = parseProjectJsonV1(happy);
  assertEqual(engineInput.payableQtyByMetal.Au[2], 100, 'happy path payable qty');
  assertEqual(engineInput.spotPriceUSDByMetal.Au[2], 10, 'happy path spot price');
  assertEqual(engineInput.phase1.capexUSD[0], -1000, 'happy path capex passthrough');

  const withContext = parseProjectJsonV1WithContext(happy);
  assert(withContext.context.operations != null, 'happy path context operations should be present');
  assertEqual(withContext.context.operations?.capacity.throughputUnit, 'tpd', 'happy path throughput unit');

  const wrongVersion = getProjectJsonV1Template();
  (wrongVersion as { version: string }).version = 'wrong';
  assertThrows(() => parseProjectJsonV1(wrongVersion), /version/, 'throws on wrong version');

  const badMasterN = getProjectJsonV1Template();
  (badMasterN.time as { masterN: number | string }).masterN = 1.2;
  assertThrows(() => parseProjectJsonV1(badMasterN), /time\.masterN/, 'throws on non-integer masterN');

  const badSeriesLength = getProjectJsonV1Template();
  badSeriesLength.series.capexUSD = [1, 2, 3];
  assertThrows(() => parseProjectJsonV1(badSeriesLength), /series\.capexUSD/, 'throws on required series length mismatch');

  const metalMismatch = getProjectJsonV1Template();
  metalMismatch.metals.spotPriceUSDByMetal = {};
  assertThrows(() => parseProjectJsonV1(metalMismatch), /spotPriceUSDByMetal\.Au/, 'throws on payable/spot metal mismatch');

  const negativeQty = getProjectJsonV1Template();
  negativeQty.metals.payableQtyByMetal.Au[1] = -1;
  assertThrows(() => parseProjectJsonV1(negativeQty), /payableQtyByMetal\.Au\[1\]/, 'throws on negative payable qty');

  const negativePrice = getProjectJsonV1Template();
  negativePrice.metals.spotPriceUSDByMetal.Au[1] = -1;
  assertThrows(() => parseProjectJsonV1(negativePrice), /spotPriceUSDByMetal\.Au\[1\]/, 'throws on negative spot price');

  const invalidOperations = getProjectJsonV1Template();
  if (invalidOperations.operations == null) {
    throw new Error('template.operations must be present');
  }
  invalidOperations.operations.capacity.nameplateThroughput = 0;
  assertThrows(
    () => parseProjectJsonV1WithContext(invalidOperations),
    /operations\.capacity\.nameplateThroughput/,
    'throws on invalid operations capacity',
  );

  console.log('Project JSON v1 parse tests passed');
})();
