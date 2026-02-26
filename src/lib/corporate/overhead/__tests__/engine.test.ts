import { computeCorporateOverheadOverlay } from '../engine.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertApproxEqual(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
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

(function runCorporateOverheadOverlayTests() {
  const happy = computeCorporateOverheadOverlay({
    masterN: 1,
    discountRate: 0.1,
    fcffUSD_total: [100, 100],
    corpGA_cash_USD: [10, 10],
    corpSBC_USD: [5, 5],
  });

  assert(happy.overheadUSD[0] === 15 && happy.overheadUSD[1] === 15, 'happy path should sum overhead components');
  assert(
    happy.fcffUSD_after_overhead[0] === 85 && happy.fcffUSD_after_overhead[1] === 85,
    'happy path should subtract overhead from FCFF',
  );
  assertApproxEqual(
    happy.npvToday_USD_before as number,
    190.9090909,
    1e-6,
    'happy path should compute before-overhead NPV',
  );
  assertApproxEqual(
    happy.npvToday_USD_after_overhead as number,
    162.2727272,
    1e-6,
    'happy path should compute after-overhead NPV',
  );
  assertApproxEqual(
    happy.overheadNPVDrag_USD as number,
    -28.6363636,
    1e-6,
    'happy path should compute overhead NPV drag',
  );

  const missingOverhead = computeCorporateOverheadOverlay({
    masterN: 1,
    discountRate: 0.1,
    fcffUSD_total: [100, 100],
    corpGA_cash_USD: [null, null],
    corpSBC_USD: [null, 5],
  });

  assert(
    missingOverhead.overheadUSD[0] === 0 && missingOverhead.overheadUSD[1] === 5,
    'missing overhead values should be treated as zero',
  );
  assert(
    missingOverhead.fcffUSD_after_overhead[0] === 100 && missingOverhead.fcffUSD_after_overhead[1] === 95,
    'missing overhead values should not null out FCFF after overhead',
  );

  const fcffNull = computeCorporateOverheadOverlay({
    masterN: 1,
    discountRate: 0.1,
    fcffUSD_total: [100, null],
    corpGA_cash_USD: [10, 10],
    corpSBC_USD: [5, 5],
  });

  assert(fcffNull.npvToday_USD_before === null, 'null FCFF should make before-overhead NPV null');
  assert(fcffNull.npvToday_USD_after_overhead === null, 'null FCFF should make after-overhead NPV null');
  assert(fcffNull.overheadNPVDrag_USD === null, 'null NPV should make drag null');

  assertThrows(
    () =>
      computeCorporateOverheadOverlay({
        masterN: 1,
        discountRate: 0.1,
        fcffUSD_total: [100, 100],
        corpGA_cash_USD: [10],
        corpSBC_USD: [5, 5],
      }),
    /corpGA_cash_USD length must be 2/,
    'length mismatch should throw',
  );

  console.log('Corporate overhead overlay engine tests passed');
})();
