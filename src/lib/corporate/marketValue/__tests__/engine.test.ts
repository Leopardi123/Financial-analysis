import { computeCorporateMarketValue } from '../engine.ts';
import type { CorporateMarketValueInput } from '../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function assertAlmostEqual(actual: number | null, expected: number, message: string): void {
  if (actual === null || Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
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

function makeBaseInput(): CorporateMarketValueInput {
  return {
    price_current_TargetCurrency: 10,
    shares_current: 100,
    cash_AfterCashFirst_TargetCurrency_t0: 200,
    debt_TargetCurrency_t0: 50,
    enterpriseAdjustments_TargetCurrency_t0: 0,
    npvToday_TargetCurrency: 900,
    navToday_TargetCurrency: 950,
  };
}

(function runCorporateMarketValueTests() {
  const happy = computeCorporateMarketValue(makeBaseInput());
  assertEqual(happy.marketCap_TargetCurrency, 1000, 'happy path should compute market cap');
  assertEqual(happy.ev_TargetCurrency, 850, 'happy path should compute EV');
  assertEqual(happy.evPerShare_TargetCurrency, 8.5, 'happy path should compute EV/share');
  assertAlmostEqual(happy.ev_over_npv, 850 / 900, 'happy path should compute EV/NPV');
  assertAlmostEqual(happy.ev_over_nav, 850 / 950, 'happy path should compute EV/NAV');
  assertAlmostEqual(happy.p_over_nav, 1000 / 950, 'happy path should compute P/NAV');

  const zeroShares = makeBaseInput();
  zeroShares.shares_current = 0;
  assertThrows(() => computeCorporateMarketValue(zeroShares), 'shares_current <= 0 should throw');

  const negativePrice = makeBaseInput();
  negativePrice.price_current_TargetCurrency = -1;
  assertThrows(() => computeCorporateMarketValue(negativePrice), 'price < 0 should throw');

  const zeroNav = makeBaseInput();
  zeroNav.navToday_TargetCurrency = 0;
  const zeroNavResult = computeCorporateMarketValue(zeroNav);
  assertEqual(zeroNavResult.ev_over_nav, null, 'ev_over_nav should be null when nav is zero');
  assertEqual(zeroNavResult.p_over_nav, null, 'p_over_nav should be null when nav is zero');

  const zeroNpv = makeBaseInput();
  zeroNpv.npvToday_TargetCurrency = 0;
  const zeroNpvResult = computeCorporateMarketValue(zeroNpv);
  assertEqual(zeroNpvResult.ev_over_npv, null, 'ev_over_npv should be null when npv is zero');

  const missingCash = makeBaseInput();
  missingCash.cash_AfterCashFirst_TargetCurrency_t0 = null;
  const missingCashResult = computeCorporateMarketValue(missingCash);
  assertEqual(missingCashResult.ev_TargetCurrency, null, 'EV should be null when cash_after is missing');
  assertEqual(
    missingCashResult.evPerShare_TargetCurrency,
    null,
    'EV/share should be null when EV is null from missing cash_after',
  );

  const missingDebt = makeBaseInput();
  missingDebt.debt_TargetCurrency_t0 = null;
  const missingDebtResult = computeCorporateMarketValue(missingDebt);
  assertEqual(missingDebtResult.ev_TargetCurrency, null, 'EV should be null when debt is missing');

  console.log('Corporate market value engine tests passed');
})();
