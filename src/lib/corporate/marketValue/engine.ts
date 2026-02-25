import type { CorporateMarketValueInput, CorporateMarketValueOutput } from './types.ts';

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

export function computeCorporateMarketValue(
  input: CorporateMarketValueInput,
): CorporateMarketValueOutput {
  const price_current_TargetCurrency = normalizeFiniteOrNull(input.price_current_TargetCurrency);
  const shares_current = normalizeFiniteOrNull(input.shares_current);
  const cash_AfterCashFirst_TargetCurrency_t0 = normalizeFiniteOrNull(
    input.cash_AfterCashFirst_TargetCurrency_t0,
  );
  const debt_TargetCurrency_t0 = normalizeFiniteOrNull(input.debt_TargetCurrency_t0);
  const enterpriseAdjustments_TargetCurrency_t0 = normalizeOptionalWithUndefinedDefault(
    input.enterpriseAdjustments_TargetCurrency_t0,
    0,
  );
  const npvToday_TargetCurrency = normalizeFiniteOrNull(input.npvToday_TargetCurrency);
  const navToday_TargetCurrency = normalizeFiniteOrNull(input.navToday_TargetCurrency);

  if (shares_current !== null && shares_current <= 0) {
    throw new Error('shares_current must be > 0 when provided');
  }

  if (price_current_TargetCurrency !== null && price_current_TargetCurrency < 0) {
    throw new Error('price_current_TargetCurrency must be >= 0 when provided');
  }

  const marketCap_TargetCurrency =
    price_current_TargetCurrency !== null && shares_current !== null
      ? price_current_TargetCurrency * shares_current
      : null;

  const ev_TargetCurrency =
    marketCap_TargetCurrency !== null &&
    debt_TargetCurrency_t0 !== null &&
    cash_AfterCashFirst_TargetCurrency_t0 !== null &&
    enterpriseAdjustments_TargetCurrency_t0 !== null
      ? marketCap_TargetCurrency +
        debt_TargetCurrency_t0 -
        cash_AfterCashFirst_TargetCurrency_t0 +
        enterpriseAdjustments_TargetCurrency_t0
      : null;

  const evPerShare_TargetCurrency =
    ev_TargetCurrency !== null && shares_current !== null ? ev_TargetCurrency / shares_current : null;

  const ev_over_npv =
    ev_TargetCurrency !== null && npvToday_TargetCurrency !== null && npvToday_TargetCurrency !== 0
      ? ev_TargetCurrency / npvToday_TargetCurrency
      : null;

  const ev_over_nav =
    ev_TargetCurrency !== null && navToday_TargetCurrency !== null && navToday_TargetCurrency !== 0
      ? ev_TargetCurrency / navToday_TargetCurrency
      : null;

  const p_over_nav =
    marketCap_TargetCurrency !== null && navToday_TargetCurrency !== null && navToday_TargetCurrency !== 0
      ? marketCap_TargetCurrency / navToday_TargetCurrency
      : null;

  return {
    marketCap_TargetCurrency,
    ev_TargetCurrency,
    evPerShare_TargetCurrency,
    ev_over_npv,
    ev_over_nav,
    p_over_nav,
  };
}
