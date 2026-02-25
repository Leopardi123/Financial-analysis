import { computeCorporateFinancing } from '../engine.ts';
import type { CorporateFinancingInput } from '../types.ts';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
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

function makeBaseInput(): CorporateFinancingInput {
  return {
    npvToday_USD_total: 1000,
    fx_USD_to_TargetCurrency: 10,
    cash_TargetCurrency_t0: 2000,
    debt_TargetCurrency_t0: 500,
    preferredEquity_TargetCurrency_t0: 0,
    minorityInterest_TargetCurrency_t0: 0,
    cashUsedForProjectFinancing_TargetCurrency_t0: 300,
  };
}

(function runCorporateFinancingTests() {
  const happy = computeCorporateFinancing(makeBaseInput());

  assertEqual(happy.npvToday_TargetCurrency, 10000, 'happy path should convert npv into target currency');
  assertEqual(happy.cash_AfterCashFirst_TargetCurrency_t0, 1700, 'happy path should apply cash-first reduction');
  assertEqual(happy.netCash_TargetCurrency_t0, 1200, 'happy path should compute net cash from cash_after and debt');
  assertEqual(happy.navToday_TargetCurrency, 11200, 'happy path should compute nav as npv_target plus net cash');
  assertEqual(happy.evAdditive_Component_TargetCurrency_t0, -1200, 'happy path should compute additive EV component');

  const cashOveruse = makeBaseInput();
  cashOveruse.cashUsedForProjectFinancing_TargetCurrency_t0 = 2500;
  assertThrows(
    () => computeCorporateFinancing(cashOveruse),
    'cashUsedForProjectFinancing > cash_TargetCurrency_t0 should throw',
  );

  const invalidFx = makeBaseInput();
  invalidFx.fx_USD_to_TargetCurrency = 0;
  assertThrows(() => computeCorporateFinancing(invalidFx), 'fx <= 0 should throw');

  const nullNpv = makeBaseInput();
  nullNpv.npvToday_USD_total = null;
  const nullNpvResult = computeCorporateFinancing(nullNpv);
  assertEqual(nullNpvResult.npvToday_TargetCurrency, null, 'null npv USD should propagate to null npv target');
  assertEqual(nullNpvResult.netCash_TargetCurrency_t0, 1200, 'net cash should still compute when debt and cash are finite');
  assertEqual(nullNpvResult.navToday_TargetCurrency, null, 'nav should be null when npv target is null');

  const nullEnterpriseAdjustment = makeBaseInput();
  nullEnterpriseAdjustment.preferredEquity_TargetCurrency_t0 = null;
  nullEnterpriseAdjustment.minorityInterest_TargetCurrency_t0 = 0;
  const nullEnterpriseResult = computeCorporateFinancing(nullEnterpriseAdjustment);
  assertEqual(
    nullEnterpriseResult.enterpriseAdjustments_TargetCurrency_t0,
    null,
    'enterprise adjustments should be null when preferred is null',
  );
  assertEqual(
    nullEnterpriseResult.evAdditive_Component_TargetCurrency_t0,
    null,
    'ev additive component should be null when enterprise adjustments are null',
  );

  console.log('Corporate financing engine tests passed');
})();
