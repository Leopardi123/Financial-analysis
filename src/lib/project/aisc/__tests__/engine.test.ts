import { computeProjectAisc } from '../engine.ts';

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

(function runProjectAiscTests() {
  const happyPath = computeProjectAisc({
    masterN: 3,
    productionStartPeriod: 1,
    grossRevenueUSD: [0, 2_000_000, 2_000_000, 1_000_000],
    auPriceUSDPerOz: [2000, 2000, 2000, 2000],
    sustainingCostUSD: [0, 1_200_000, 1_300_000, 700_000],
  });

  assertDeepEqual(happyPath.payableAuEqOz, [0, 1000, 1000, 500], 'happy path payable AuEq ounces');
  assertEqual(happyPath.lomPeriods, 3, 'happy path LOM period count');
  assertEqual(happyPath.aiscAuEqUSDPerOz_LOM, 1280, 'happy path AISC');

  const missingAuPrice = computeProjectAisc({
    masterN: 3,
    productionStartPeriod: 1,
    grossRevenueUSD: [0, 2_000_000, 2_000_000, 1_000_000],
    auPriceUSDPerOz: [2000, 2000, null, 2000],
    sustainingCostUSD: [0, 1_200_000, 1_300_000, 700_000],
  });

  assertDeepEqual(missingAuPrice.payableAuEqOz, [0, 1000, null, 500], 'missing Au price should null payable at that period');
  assertEqual(missingAuPrice.lomPeriods, 2, 'missing Au price should exclude that period from LOM');
  assertEqual(missingAuPrice.aiscAuEqUSDPerOz_LOM, 1266.6666666666667, 'AISC should use only included periods');

  const nullSustaining = computeProjectAisc({
    masterN: 3,
    productionStartPeriod: 1,
    grossRevenueUSD: [0, 2_000_000, 2_000_000, 1_000_000],
    auPriceUSDPerOz: [2000, 2000, 2000, 2000],
    sustainingCostUSD: [0, null, 1_300_000, 700_000],
  });

  assertEqual(nullSustaining.lomPeriods, 3, 'null sustaining in included period should not change LOM counting');
  assertEqual(nullSustaining.aiscAuEqUSDPerOz_LOM, null, 'null sustaining in included period should null AISC');

  const tpAfterMasterN = computeProjectAisc({
    masterN: 2,
    productionStartPeriod: 5,
    grossRevenueUSD: [100, 100, 100],
    auPriceUSDPerOz: [2000, 2000, 2000],
    sustainingCostUSD: [10, 10, 10],
  });

  assertEqual(tpAfterMasterN.lomPeriods, 0, 'tp > masterN should produce zero LOM periods');
  assertEqual(tpAfterMasterN.aiscAuEqUSDPerOz_LOM, null, 'tp > masterN should produce null AISC');

  assertThrows(
    () =>
      computeProjectAisc({
        masterN: 2,
        productionStartPeriod: 0,
        grossRevenueUSD: [100, 100, 100],
        auPriceUSDPerOz: [2000, 2000],
        sustainingCostUSD: [10, 10, 10],
      }),
    /auPriceUSDPerOz length must equal masterN\+1/,
    'length mismatch should throw with clear field name',
  );

  console.log('Project AISC tests passed');
})();
