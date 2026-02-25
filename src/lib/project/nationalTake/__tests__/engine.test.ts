import { computeProjectPhase1 } from '../../phase1.ts';
import { computeNationalTake } from '../engine.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

(function runNationalTakeTests() {
  const happyPath = computeNationalTake({
    masterN: 1,
    grossRevenueUSD: [1000, 1000],
    items: [
      {
        id: 'nsr-5pct',
        base: { baseType: 'REVENUE' },
        rate: { rateType: 'FIXED', value: 0.05 },
      },
      {
        id: 'profit-duty-10pct',
        base: { baseType: 'OPERATING_PROFIT' },
        rate: { rateType: 'FIXED', value: 0.1 },
      },
    ],
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

  assertDeepEqual(happyPath.revenueTakeUSD, [50, 50], 'happy path revenue take');
  assertDeepEqual(happyPath.netRevenueAfterRevenueTakeUSD, [950, 950], 'happy path net revenue after revenue take');
  assertDeepEqual(happyPath.profitTakeUSD, [55, 55], 'happy path profit take from EBIT base');
  assertDeepEqual(happyPath.totalTakeUSD, [105, 105], 'happy path strict total take');
  assertDeepEqual(happyPath.phase1.ebitUSD, [445, 445], 'happy path final EBIT includes both takes as royalties');

  const onlyRevenueItems = computeNationalTake({
    masterN: 1,
    grossRevenueUSD: [1000, 1000],
    items: [
      {
        id: 'nsr-5pct',
        base: { baseType: 'REVENUE' },
        rate: { rateType: 'FIXED', value: 0.05 },
      },
    ],
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

  const phase1RevenueOnly = computeProjectPhase1({
    masterN: 1,
    productionStartPeriod: 0,
    taxRate: 0,
    capexUSD: [0, 0],
    revenueUSD: [950, 950],
    operatingCostsUSD: [400, 400],
    sustainingCapexUSD: [0, 0],
    royaltiesUSD: [50, 50],
    siteGandA_USD: [0, 0],
    reclamationUSD: [0, 0],
  });

  assertDeepEqual(onlyRevenueItems.profitTakeUSD, [0, 0], 'only revenue items should produce zero profit take');
  assertDeepEqual(onlyRevenueItems.totalTakeUSD, onlyRevenueItems.revenueTakeUSD, 'only revenue items should have total==revenue take');
  assertDeepEqual(onlyRevenueItems.phase1, phase1RevenueOnly, 'only revenue items should match phase1 with revenue take only');

  const missingOperatingProfitPath = computeNationalTake({
    masterN: 1,
    grossRevenueUSD: [1e308, 1000],
    items: [
      {
        id: 'nsr-5pct',
        base: { baseType: 'REVENUE' },
        rate: { rateType: 'FIXED', value: 0.05 },
      },
      {
        id: 'profit-duty-10pct',
        base: { baseType: 'OPERATING_PROFIT' },
        rate: { rateType: 'FIXED', value: 0.1 },
      },
    ],
    phase1: {
      masterN: 1,
      productionStartPeriod: 0,
      taxRate: 0,
      capexUSD: [0, 0],
      operatingCostsUSD: [-1e308, 400],
      sustainingCapexUSD: [0, 0],
      siteGandA_USD: [0, 0],
      reclamationUSD: [0, 0],
    },
  });

  assert(missingOperatingProfitPath.profitTakeUSD[0] === null, 'missing operating profit should produce null profit take');
  assert(missingOperatingProfitPath.totalTakeUSD[0] === null, 'null profit take should produce null total take in strict aggregation');

  const withExtraRoyalties = computeNationalTake({
    masterN: 0,
    grossRevenueUSD: [1000],
    items: [
      {
        id: 'nsr-5pct',
        base: { baseType: 'REVENUE' },
        rate: { rateType: 'FIXED', value: 0.05 },
      },
    ],
    phase1: {
      masterN: 0,
      productionStartPeriod: 0,
      taxRate: 0,
      capexUSD: [0],
      operatingCostsUSD: [0],
      sustainingCapexUSD: [0],
      siteGandA_USD: [0],
      reclamationUSD: [0],
    },
    extraRoyaltiesUSD: [80],
  });

  assertDeepEqual(withExtraRoyalties.totalTakeUSD, [50], 'extra royalties should not change take totals');
  assertDeepEqual(withExtraRoyalties.totalRoyaltiesUSD, [130], 'extra royalties should be included in final royalties');

})();
