import { computeProjectPhase2 } from '../phase2.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}


function assertNull(value: unknown, message: string): void {
  assert(value === null, `${message}. Expected null, received ${String(value)}`);
}

function assertNear(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${expected}, received ${actual}`);
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

(function runPhase2Tests() {
  const happyPath = computeProjectPhase2({
    masterN: 2,
    productionStartPeriod: 1,
    discountRate: 0.1,
    fcffUSD: [-100, 70, 70],
  });

  assertNear(happyPath.dfToToday[0] as number, 1, 1e-12, 'dfToToday[0]');
  assertNear(happyPath.dfToToday[1] as number, 1 / 1.1, 1e-12, 'dfToToday[1]');
  assertNear(happyPath.dfToToday[2] as number, 1 / 1.1 ** 2, 1e-12, 'dfToToday[2]');

  assertNear(happyPath.cfLOM_USD as number, 40, 1e-12, 'CF_LOM_USD');

  const expectedNpv = -100 + 70 / 1.1 + 70 / 1.21;
  assertNear(happyPath.npvToday_USD as number, expectedNpv, 1e-9, 'NPV_today_USD');

  const expectedDcfProdStart = 70 + 70 / 1.1;
  assertNear(happyPath.dcfProdStart_exCapex_USD as number, expectedDcfProdStart, 1e-9, 'DCF_prodStart_exCapex_USD');

  const expectedDcfPresent = expectedDcfProdStart * (1 / 1.1);
  assertNear(happyPath.dcfProdStart_present_USD as number, expectedDcfPresent, 1e-9, 'DCF_prodStart_present_USD');

  assertNear(happyPath.irr as number, 0.256917857, 1e-3, 'IRR');

  assertNear(happyPath.npv_over_etlv as number, expectedNpv / 40, 1e-9, 'npv_over_etlv');
  assertNear(happyPath.dcf_present_over_etlv as number, expectedDcfPresent / 40, 1e-9, 'dcf_present_over_etlv');

  const strictNull = computeProjectPhase2({
    masterN: 2,
    productionStartPeriod: 1,
    discountRate: 0.1,
    fcffUSD: [-100, null, 70],
  });

  assertNear(strictNull.dfToToday[1] as number, 1 / 1.1, 1e-12, 'strict-null dfToToday should still compute');
  assertNull(strictNull.cfLOM_USD, 'strict-null cfLOM_USD');
  assertNull(strictNull.npvToday_USD, 'strict-null npvToday_USD');
  assertNull(strictNull.dcfProdStart_exCapex_USD, 'strict-null dcfProdStart_exCapex_USD');
  assertNull(strictNull.dcfProdStart_present_USD, 'strict-null dcfProdStart_present_USD');
  assertNull(strictNull.irr, 'strict-null irr');
  assertNull(strictNull.npv_over_etlv, 'strict-null npv_over_etlv');
  assertNull(strictNull.dcf_present_over_etlv, 'strict-null dcf_present_over_etlv');

  const tpBeyondLife = computeProjectPhase2({
    masterN: 2,
    productionStartPeriod: 5,
    discountRate: 0.1,
    fcffUSD: [-100, 70, 70],
  });

  assertNear(tpBeyondLife.cfLOM_USD as number, 40, 1e-12, 'tp>masterN cfLOM_USD');
  assertNear(tpBeyondLife.npvToday_USD as number, expectedNpv, 1e-9, 'tp>masterN npvToday_USD');
  assertNull(tpBeyondLife.dcfProdStart_exCapex_USD, 'tp>masterN dcfProdStart_exCapex_USD');
  assertNull(tpBeyondLife.dcfProdStart_present_USD, 'tp>masterN dcfProdStart_present_USD');
  assertNull(tpBeyondLife.dcf_present_over_etlv, 'tp>masterN dcf_present_over_etlv');

  const noSignChange = computeProjectPhase2({
    masterN: 2,
    productionStartPeriod: 1,
    discountRate: 0.1,
    fcffUSD: [10, 20, 30],
  });
  assertNull(noSignChange.irr, 'all-positive series should return null IRR');

  assertThrows(
    () =>
      computeProjectPhase2({
        masterN: 2,
        productionStartPeriod: 1,
        discountRate: 0,
        fcffUSD: [-100, 70, 70],
      }),
    /discountRate must be finite and within \(0, 0\.25\]/,
    'discountRate must throw when out of range',
  );

  console.log('Phase2 tests passed');
})();
