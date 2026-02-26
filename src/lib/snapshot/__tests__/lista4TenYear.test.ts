import { computeLista4TenYearMetrics } from '../lista4TenYear.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertAlmostEqual(actual: number | null, expected: number, message: string): void {
  if (actual === null || Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

(function run() {
  const revenue = [10,20,30,40,50,60,70,80,90,100];
  const fcff = [1,2,3,4,5,6,7,8,9,10];
  const au = [2,2,2,2,2,2,2,2,2,2];

  const happy = computeLista4TenYearMetrics({
    masterN: 9,
    revenueUSD_total: revenue,
    fcffUSD_total: fcff,
    auPriceUSDPerOz: au,
    fx_USD_to_TargetCurrency: 2,
    shares_current: 100,
    shares_post_financing: 200,
    ev_TargetCurrency: 1100,
    totalStockholdersEquity_USD: 500,
  });

  assertAlmostEqual(happy.Revenue_10Y_USD, 550, 'Revenue_10Y_USD sums 0..9');
  assertAlmostEqual(happy.AuEq_Oz_10Y, 275, 'AuEq_Oz_10Y sums revenue/auPrice');
  assertAlmostEqual(happy.Revenue_10Y_TargetCurrency, 1100, 'Revenue_10Y_TargetCurrency applies fx');
  assertAlmostEqual(happy.EV_over_Revenue_10Y, 1, 'EV_over_Revenue_10Y uses target currency denominator');

  const strictNullRevenue = computeLista4TenYearMetrics({
    ...{
      masterN: 9,
      revenueUSD_total: [...revenue.slice(0, 4), null, ...revenue.slice(5)],
      fcffUSD_total: fcff,
      auPriceUSDPerOz: au,
      fx_USD_to_TargetCurrency: 2,
      shares_current: 100,
      shares_post_financing: 200,
      ev_TargetCurrency: 1100,
      totalStockholdersEquity_USD: 500,
    },
  });

  assertEqual(strictNullRevenue.Revenue_10Y_USD, null, 'Revenue_10Y_USD strict-nulls on missing period');

  console.log('Lista4 10Y tests passed');
})();
