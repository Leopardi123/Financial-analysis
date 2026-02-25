import type { CorporateFinancingInput, CorporateFinancingOutput } from './types.ts';

function normalizeFiniteOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number.isFinite(value) ? value : null;
}

function normalizeOptionalWithUndefinedDefault(
  value: number | null | undefined,
  defaultValue: number,
): number | null {
  if (value === undefined) {
    return defaultValue;
  }

  return normalizeFiniteOrNull(value);
}

export function computeCorporateFinancing(input: CorporateFinancingInput): CorporateFinancingOutput {
  const npvToday_USD_total = normalizeFiniteOrNull(input.npvToday_USD_total);
  const fx_USD_to_TargetCurrency = normalizeFiniteOrNull(input.fx_USD_to_TargetCurrency);
  const cash_TargetCurrency_t0 = normalizeFiniteOrNull(input.cash_TargetCurrency_t0);
  const debt_TargetCurrency_t0 = normalizeFiniteOrNull(input.debt_TargetCurrency_t0);

  const preferredEquity_TargetCurrency_t0 = normalizeOptionalWithUndefinedDefault(
    input.preferredEquity_TargetCurrency_t0,
    0,
  );
  const minorityInterest_TargetCurrency_t0 = normalizeOptionalWithUndefinedDefault(
    input.minorityInterest_TargetCurrency_t0,
    0,
  );
  const cashUsedForProjectFinancing_TargetCurrency_t0 = normalizeFiniteOrNull(
    input.cashUsedForProjectFinancing_TargetCurrency_t0,
  ) ?? 0;

  if (fx_USD_to_TargetCurrency !== null && fx_USD_to_TargetCurrency <= 0) {
    throw new Error('fx_USD_to_TargetCurrency must be > 0 when provided');
  }

  if (cashUsedForProjectFinancing_TargetCurrency_t0 < 0) {
    throw new Error('cashUsedForProjectFinancing_TargetCurrency_t0 must be >= 0 when provided');
  }

  let cash_AfterCashFirst_TargetCurrency_t0: number | null = null;
  if (cash_TargetCurrency_t0 !== null) {
    cash_AfterCashFirst_TargetCurrency_t0 = cash_TargetCurrency_t0 - cashUsedForProjectFinancing_TargetCurrency_t0;

    if (cash_AfterCashFirst_TargetCurrency_t0 < 0) {
      throw new Error('cashUsedForProjectFinancing_TargetCurrency_t0 cannot exceed cash_TargetCurrency_t0');
    }
  }

  const enterpriseAdjustments_TargetCurrency_t0 =
    preferredEquity_TargetCurrency_t0 === null || minorityInterest_TargetCurrency_t0 === null
      ? null
      : preferredEquity_TargetCurrency_t0 + minorityInterest_TargetCurrency_t0;

  const npvToday_TargetCurrency =
    npvToday_USD_total !== null && fx_USD_to_TargetCurrency !== null
      ? npvToday_USD_total * fx_USD_to_TargetCurrency
      : null;

  const netCash_TargetCurrency_t0 =
    cash_AfterCashFirst_TargetCurrency_t0 !== null && debt_TargetCurrency_t0 !== null
      ? cash_AfterCashFirst_TargetCurrency_t0 - debt_TargetCurrency_t0
      : null;

  const navToday_TargetCurrency =
    npvToday_TargetCurrency !== null && netCash_TargetCurrency_t0 !== null
      ? npvToday_TargetCurrency + netCash_TargetCurrency_t0
      : null;

  const evAdditive_Component_TargetCurrency_t0 =
    debt_TargetCurrency_t0 !== null &&
    cash_AfterCashFirst_TargetCurrency_t0 !== null &&
    enterpriseAdjustments_TargetCurrency_t0 !== null
      ? debt_TargetCurrency_t0 -
        cash_AfterCashFirst_TargetCurrency_t0 +
        enterpriseAdjustments_TargetCurrency_t0
      : null;

  return {
    npvToday_TargetCurrency,
    cash_AfterCashFirst_TargetCurrency_t0,
    debt_TargetCurrency_t0,
    netCash_TargetCurrency_t0,
    navToday_TargetCurrency,
    enterpriseAdjustments_TargetCurrency_t0,
    evAdditive_Component_TargetCurrency_t0,
  };
}
