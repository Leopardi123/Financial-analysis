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
      productionStartPeriod: 2,
      periodEndDatesUtc: ['2024-12-31', '2025-12-31', '2026-12-31'],
    },
    {
      projectId: 'B',
      productionStartPeriod: 1,
      periodEndDatesUtc: ['2024-12-31', '2025-12-31', '2026-12-31'],
    },
  ];

  const simple = deriveBuildFundingNeedUSD({
    corporatePeriodEndDatesUtc: ['2024-12-31', '2025-12-31', '2026-12-31'],
    capexUSD_total: [-100, -50, 0],
    projects,
  });
  assertEqual(simple, 100, 'simple case should only include periods before first production date');

  const strictNull = deriveBuildFundingNeedUSD({
    corporatePeriodEndDatesUtc: ['2024-12-31', '2025-12-31', '2026-12-31'],
    capexUSD_total: [null, -50, 0],
    projects,
  });
  assertEqual(strictNull, null, 'null capex in build window should return null');

  const nonNegative = deriveBuildFundingNeedUSD({
    corporatePeriodEndDatesUtc: ['2024-12-31', '2025-12-31', '2026-12-31'],
    capexUSD_total: [25, -50, 0],
    projects,
  });
  assertEqual(nonNegative, 0, 'non-negative build window capex should return zero funding need');

  console.log('deriveBuildFundingNeed tests passed');
})();
