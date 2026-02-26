import { computeCorporateFinancing } from '../compute.ts';
import type { CorporateFinancingInput } from '../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertClose(actual: number | null, expected: number, message: string): void {
  if (actual === null || Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
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

function baseInput(): CorporateFinancingInput {
  return {
    NPV_today_USD: 100,
    targetCurrency: 'SEK',
    fx_USD_to_TargetCurrency: 10,
    cash_t0_TargetCurrency: 1000,
    debt_t0_TargetCurrency: 0,
    shares_current: 100,
    price_current_TargetCurrency: 2,
    buildFundingNeed_USD: 50,
  };
}

(function runTests() {
  const case1 = computeCorporateFinancing(baseInput());
  assertEqual(case1.cash_used_for_build_TargetCurrency, 500, 'case1 cash-first uses build funding from cash');
  assertEqual(case1.equity_raised_TargetCurrency, 0, 'case1 no equity raise needed');
  assertEqual(case1.new_debt_TargetCurrency, 0, 'case1 no debt raise needed');
  assertEqual(case1.cash_t0_post_TargetCurrency, 500, 'case1 post cash should be reduced');
  assertEqual(case1.NPV_today_TargetCurrency, 1000, 'case1 npv converted to target currency');
  assertEqual(case1.NAV_today_TargetCurrency, 1500, 'case1 nav includes post cash and debt');

  const case2Input = baseInput();
  case2Input.cash_t0_TargetCurrency = 100;
  const case2 = computeCorporateFinancing(case2Input);
  assertEqual(case2.cash_used_for_build_TargetCurrency, 100, 'case2 uses all available cash');
  assertEqual(case2.equity_raised_TargetCurrency, 400, 'case2 raises residual need as equity');
  assertEqual(case2.new_shares, 200, 'case2 new shares from raise amount / price');
  assertEqual(case2.shares_post_financing, 300, 'case2 post-financing shares include new shares');

  const case3Input = baseInput();
  case3Input.cash_t0_TargetCurrency = 0;
  case3Input.buildFundingNeed_USD = 100;
  case3Input.financingPlan = {
    debt_fraction: 0.4,
    equity_fraction: 0.6,
  };
  const case3 = computeCorporateFinancing(case3Input);
  assertEqual(case3.new_debt_TargetCurrency, 400, 'case3 debt split should match fraction');
  assertEqual(case3.equity_raised_TargetCurrency, 600, 'case3 equity split should match fraction');

  const case4Input = baseInput();
  case4Input.financingPlan = {
    use_cash_first: false,
  };
  const case4 = computeCorporateFinancing(case4Input);
  assertEqual(case4.cash_used_for_build_TargetCurrency, 0, 'case4 cash-first disabled should not use cash');
  assertEqual(case4.equity_raised_TargetCurrency, 500, 'case4 full build need raised');

  const case5Input = baseInput();
  case5Input.financingPlan = {
    debt_fraction: 0.8,
    equity_fraction: 0.3,
  };
  assertThrows(
    () => computeCorporateFinancing(case5Input),
    'case5 fractions not summing to 1 should throw',
  );

  const case6Input = baseInput();
  case6Input.NPV_today_USD = null;
  case6Input.cash_t0_TargetCurrency = 0;
  case6Input.debt_t0_TargetCurrency = 50;
  case6Input.buildFundingNeed_USD = 0;
  const case6 = computeCorporateFinancing(case6Input);
  assertClose(case6.Debt_to_Equity_ratio, 0.25, 'case6 debt-to-equity should use market-now equity');

  console.log('Corporate financing Lista 5 tests passed');
})();
