import { computeRoyaltiesFromDetail } from '../mvi.ts';

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

(function runRoyaltiesMviTests() {
  const out = computeRoyaltiesFromDetail({
    grossRevenueUSD: [0, 0, 100, 200],
    royaltiesDetail: [{ base: 'revenue', rateType: 'NSR_pct', rate: 4 }],
  });

  assertDeepEqual(out.royaltiesUSD_calc, [0, 0, 4, 8], 'MVI royalties computed from revenue NSR_pct');

  console.log('Royalties MVI tests passed');
})();
