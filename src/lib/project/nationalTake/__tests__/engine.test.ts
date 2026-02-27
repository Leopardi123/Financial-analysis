import { computeNationalTake } from '../engine.ts';

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

(function runNationalTakeTests() {
  const out = computeNationalTake({
    masterN: 1,
    grossRevenueUSD: [1000, 1000],
    items: [{
      id: 'nsr-5pct',
      jurisdictionLevel: 'national',
      metals: ['ALL'],
      baseType: 'REVENUE',
      rateType: 'FIXED',
      rateFixed: 0.05,
    }],
    royaltiesDetail: [{ id: 'nsr-detail', base: 'revenue', rateType: 'NSR_pct', rate: 5 }],
    phase1: {
      masterN: 1,
      productionStartPeriod: 0,
      taxRate: 0,
      capexUSD: [0, 0],
      operatingCostsUSD: [400, 400],
      sustainingCapexUSD: [0, 0],
      siteGandA_USD: [0, 0],
      reclamationUSD: [0, 0],
    },
  });

  assertDeepEqual(out.totalTakeUSD, [50, 50], 'total take');
  assertDeepEqual(out.totalRoyaltiesUSD, [50, 50], 'royalties derived from royaltiesDetail');
  assertDeepEqual(out.phase1.ebitUSD, [550, 550], 'phase1 uses derived royalties');

  const override = computeNationalTake({
    masterN: 1,
    grossRevenueUSD: [1000, 1000],
    items: [{
      id: 'nsr-5pct',
      jurisdictionLevel: 'national',
      metals: ['ALL'],
      baseType: 'REVENUE',
      rateType: 'FIXED',
      rateFixed: 0.05,
    }],
    royaltiesDetail: [{ id: 'nsr-detail', base: 'revenue', rateType: 'NSR_pct', rate: 5 }],
    phase1: {
      masterN: 1,
      productionStartPeriod: 0,
      taxRate: 0,
      capexUSD: [0, 0],
      operatingCostsUSD: [400, 400],
      sustainingCapexUSD: [0, 0],
      siteGandA_USD: [0, 0],
      reclamationUSD: [0, 0],
      royaltiesUSD: [0, 999],
    },
  });

  assertDeepEqual(override.totalTakeUSD, [50, 50], 'take output unaffected by override');
  assertDeepEqual(override.totalRoyaltiesUSD, [0, 999], 'override royalties takes precedence');
  if (!override.diagnostics.includes('royaltiesUSD: manual override detected; ignoring royaltiesDetail for calculation')) {
    throw new Error('expected manual override diagnostic');
  }

  console.log('National take tests passed');
})();
