import { computeProjectAisc } from '../engine.ts';

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

(function runProjectAiscMVITests() {
  const happyPath = computeProjectAisc({
    masterN: 3,
    productionStartPeriod: 1,
    grossRevenueUSD: [0, 1900, 3800, 5700],
    auPriceUSDPerOz: [1900, 1900, 1900, 1900],
    sustainingCostUSD: [0, 1000, 2000, 3000],
  });

  assertDeepEqual(happyPath.payableAuEqOz, [0, 1, 2, 3], 'happy path payable AuEq ounces');
  assertEqual(happyPath.lomPeriods, 3, 'happy path LOM period count');
  assertEqual(happyPath.aiscAuEqUSDPerOz_LOM, 1000, 'happy path AISC');

  const missingPrice = computeProjectAisc({
    masterN: 3,
    productionStartPeriod: 1,
    grossRevenueUSD: [0, 100, 200, 300],
    auPriceUSDPerOz: [1900, null, null, null],
    sustainingCostUSD: [0, 10, 20, 30],
  });

  assertDeepEqual(missingPrice.payableAuEqOz, [0, null, null, null], 'missing au price should null payable ounces');
  assertEqual(missingPrice.lomPeriods, 0, 'missing au price should have zero LOM periods');
  assertEqual(missingPrice.aiscAuEqUSDPerOz_LOM, null, 'all excluded periods should return null AISC');

  const nullSustainingCost = computeProjectAisc({
    masterN: 3,
    productionStartPeriod: 1,
    grossRevenueUSD: [0, 1900, 1900, 1900],
    auPriceUSDPerOz: [1900, 1900, 1900, 1900],
    sustainingCostUSD: [0, 100, null, 100],
  });

  assertEqual(nullSustainingCost.lomPeriods, 2, 'null sustaining cost should stop at first included null period');
  assertEqual(nullSustainingCost.aiscAuEqUSDPerOz_LOM, null, 'null sustaining cost in included period should null AISC');

  const tpAfterMasterN = computeProjectAisc({
    masterN: 2,
    productionStartPeriod: 3,
    grossRevenueUSD: [100, 100, 100],
    auPriceUSDPerOz: [1900, 1900, 1900],
    sustainingCostUSD: [10, 10, 10],
  });

  assertEqual(tpAfterMasterN.lomPeriods, 0, 'tp greater than masterN should have zero LOM periods');
  assertEqual(tpAfterMasterN.aiscAuEqUSDPerOz_LOM, null, 'tp greater than masterN should return null AISC');

  console.log('Project AISC engine MVI tests passed');
})();
