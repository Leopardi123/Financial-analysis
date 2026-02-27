import { computeLista1FinancialValuationMetrics } from '../lista1FinancialValuation.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

(function run() {
  const happy = computeLista1FinancialValuationMetrics({
    npvToday_TargetCurrency: 1000,
    navToday_TargetCurrency: 900,
    ev_TargetCurrency: 500,
    shares_post_financing: 100,
    shares_current: 50,
  });

  assertEqual(happy.NPV_today_perShare_TargetCurrency, 10, 'NPV per share uses shares_post_financing');
  assertEqual(happy.NAV_today_perShare_TargetCurrency, 9, 'NAV per share uses shares_post_financing');
  assertEqual(happy.EVPS_TargetCurrency, 10, 'EVPS uses shares_current');

  const guarded = computeLista1FinancialValuationMetrics({
    npvToday_TargetCurrency: 1000,
    navToday_TargetCurrency: 900,
    ev_TargetCurrency: 500,
    shares_post_financing: 0,
    shares_current: null,
  });

  assertEqual(guarded.NPV_today_perShare_TargetCurrency, null, 'shares_post_financing guard returns null');
  assertEqual(guarded.NAV_today_perShare_TargetCurrency, null, 'shares_post_financing guard returns null for NAV');
  assertEqual(guarded.EVPS_TargetCurrency, null, 'shares_current guard returns null');

  console.log('Lista1 financial valuation tests passed');
})();
