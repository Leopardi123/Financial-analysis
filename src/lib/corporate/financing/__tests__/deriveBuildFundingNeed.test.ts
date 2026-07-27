import { deriveBuildFundingNeedUSD } from '../deriveBuildFundingNeed.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

(function runTests() {
  const projects = [
    {
      projectId: 'A',
      masterN: 2,
      productionStartPeriod: 2,
      yearsByPeriod: [2024, 2025, 2026],
    },
    {
      projectId: 'B',
      masterN: 2,
      productionStartPeriod: 1,
      yearsByPeriod: [2024, 2025, 2026],
    },
  ];

  const simple = deriveBuildFundingNeedUSD({
    yearsByPeriod: [2024, 2025, 2026],
    masterN: 2,
    capexUSD_total: [-100, -50, 0],
    projects,
    valuationYear: 2025,
  });
  assertEqual(simple, 50, 'funding need should include current and future periods, not passed periods');

  const strictNull = deriveBuildFundingNeedUSD({
    yearsByPeriod: [2024, 2025, 2026],
    masterN: 2,
    capexUSD_total: [null, -50, 0],
    projects,
    valuationYear: 2024,
  });
  assertEqual(strictNull, null, 'null capex in build window should return null');

  const nonNegative = deriveBuildFundingNeedUSD({
    yearsByPeriod: [2024, 2025, 2026],
    masterN: 2,
    capexUSD_total: [25, -50, 0],
    projects,
    valuationYear: 2025,
  });
  assertEqual(nonNegative, 50, 'positive spend convention should produce the same funding need');

  console.log('deriveBuildFundingNeed tests passed');
})();
