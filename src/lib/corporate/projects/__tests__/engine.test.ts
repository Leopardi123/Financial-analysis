import { computeCorporateProjects } from '../engine.ts';
import type { CorporateProjectsInput } from '../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertApproxEqual(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

function makeBaseInput(): CorporateProjectsInput & { discountRate: number } {
  return {
    masterN: 2,
    discountRate: 0.1,
    projects: [
      {
        id: 'A',
        productionStartPeriod: 1,
        fcffUSD: [-100, 50, 50],
        capexUSD: [100, 0, 0],
        grossRevenueUSD: [0, 1000, 1000],
        sustainingCostUSD: [0, 600, 600],
        payableAuEqOz: [0, 0.5, 0.5],
      },
      {
        id: 'B',
        productionStartPeriod: 0,
        fcffUSD: [-50, 30, 30],
        capexUSD: [50, 0, 0],
        grossRevenueUSD: [500, 500, 500],
        sustainingCostUSD: [300, 300, 300],
        payableAuEqOz: [0.25, 0.25, 0.25],
      },
    ],
  };
}

(function runCorporateProjectEngineTests() {
  const happy = computeCorporateProjects(makeBaseInput());

  assertDeepEqual(happy.fcffUSD_total, [-150, 80, 80], 'happy path should aggregate fcff series element-wise');
  assertEqual(happy.cfLOM_USD_total, 10, 'happy path should compute CF LOM from aggregated fcff series');

  const expectedNpv = -150 + 80 / 1.1 + 80 / 1.1 ** 2;
  assertEqual(happy.npvToday_USD_total === null, false, 'happy path npv should not be null');
  assertApproxEqual(happy.npvToday_USD_total as number, expectedNpv, 1e-9, 'npv should match discounted aggregated fcff');

  assertApproxEqual(happy.payableAuEqOz_total_included as number, 1.75, 1e-12, 'AISC denominator should match included payable ounces');
  assertApproxEqual(happy.sustainingCostUSD_total_included as number, 2100, 1e-12, 'AISC numerator should match included sustaining costs');
  assertApproxEqual(happy.aiscAuEqUSDPerOz_LOM_corp as number, 1200, 1e-12, 'AISC should use aggregated numerator/denominator');

  const strictNullInput = makeBaseInput();
  strictNullInput.projects[1].fcffUSD[1] = null;
  const strictNull = computeCorporateProjects(strictNullInput);

  assertEqual(strictNull.fcffUSD_total[1], null, 'strict totals should null out a period if any project has null');
  assertEqual(strictNull.cfLOM_USD_total, null, 'cf LOM should be null when aggregated fcff contains null');
  assertEqual(strictNull.npvToday_USD_total, null, 'npv should be null when aggregated fcff contains null');

  const aiscStrictNullInput = makeBaseInput();
  aiscStrictNullInput.projects[0].sustainingCostUSD[1] = null;
  const aiscStrictNull = computeCorporateProjects(aiscStrictNullInput);

  assertEqual(aiscStrictNull.aiscAuEqUSDPerOz_LOM_corp, null, 'AISC should be null if included sustaining cost is null');
  assertEqual(aiscStrictNull.sustainingCostUSD_total_included, null, 'AISC numerator should be null if included sustaining cost is null');

  const mismatchInput = makeBaseInput();
  mismatchInput.projects[0].fcffUSD = [-100, 50];
  assertThrows(
    () => computeCorporateProjects(mismatchInput),
    'length mismatch should throw for invalid project series length',
  );

  console.log('Corporate projects engine tests passed');
})();
