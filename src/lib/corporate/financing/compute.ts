import type { CorporateFinancingInput, CorporateFinancingOutput } from './types.ts';

const FRACTION_TOLERANCE = 1e-6;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateFraction(name: string, value: number | null | undefined): void {
  if (value == null) {
    return;
  }

  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be in [0, 1] when provided`);
  }
}

export function computeCorporateFinancing(input: CorporateFinancingInput): CorporateFinancingOutput {
  if (!isFiniteNumber(input.fx_USD_to_TargetCurrency) || input.fx_USD_to_TargetCurrency <= 0) {
    throw new Error('fx_USD_to_TargetCurrency must be finite and > 0');
  }

  const npvTodayUSD = input.NPV_today_USD ?? input.npvToday_USD_total ?? null;
  const cashT0 = input.cash_t0_TargetCurrency ?? input.cash_TargetCurrency_t0 ?? 0;
  const debtT0 = input.debt_t0_TargetCurrency ?? input.debt_TargetCurrency_t0 ?? 0;

  const debtFractionRaw = input.financingPlan?.debt_fraction;
  const equityFractionRaw = input.financingPlan?.equity_fraction;

  validateFraction('debt_fraction', debtFractionRaw);
  validateFraction('equity_fraction', equityFractionRaw);

  if (debtFractionRaw != null && equityFractionRaw != null) {
    if (Math.abs(debtFractionRaw + equityFractionRaw - 1) > FRACTION_TOLERANCE) {
      throw new Error('debt_fraction + equity_fraction must sum to 1 when both are provided');
    }
  }

  const debt_fraction = debtFractionRaw ?? 0;
  const equity_fraction = equityFractionRaw ?? 1;
  const use_cash_first = input.financingPlan?.use_cash_first ?? true;
  const cashUsedPercent = input.financingPlan?.cash_use_percent ?? 1;
  validateFraction('cash_use_percent', cashUsedPercent);

  const raisePriceRaw =
    input.financingPlan?.equity_raise_price_TargetCurrency ?? input.price_current_TargetCurrency;

  if (raisePriceRaw != null && (!isFiniteNumber(raisePriceRaw) || raisePriceRaw <= 0)) {
    throw new Error('equity_raise_price_TargetCurrency must be finite and > 0 when used');
  }

  const NPV_today_TargetCurrency =
    npvTodayUSD === null ? null : npvTodayUSD * input.fx_USD_to_TargetCurrency;

  const buildFundingNeedUSD = input.buildFundingNeed_USD ?? null;

  if (buildFundingNeedUSD === null) {
    const debt_existing = debtT0;
    const equity_now =
      isFiniteNumber(input.shares_current) && isFiniteNumber(input.price_current_TargetCurrency)
        ? input.shares_current * input.price_current_TargetCurrency
        : null;

    return {
      latest_quarterly_cash_TargetCurrency: cashT0,
      cash_used_percent: cashUsedPercent,
      remaining_funding_need_TargetCurrency: null,
      cash_used_for_build_TargetCurrency: null,
      cash_t0_post_TargetCurrency: null,
      new_debt_TargetCurrency: null,
      debt_t0_post_TargetCurrency: null,
      equity_raised_TargetCurrency: null,
      new_shares: null,
      shares_post_financing: input.shares_current,
      NPV_today_TargetCurrency,
      NAV_today_TargetCurrency: null,
      Debt_to_Equity_ratio:
        equity_now !== null && equity_now > 0 && Number.isFinite(debt_existing)
          ? debt_existing / equity_now
          : null,
      npvToday_TargetCurrency: NPV_today_TargetCurrency,
      navToday_TargetCurrency: null,
      cash_AfterCashFirst_TargetCurrency_t0: null,
      debt_TargetCurrency_t0: null,
      netCash_TargetCurrency_t0: null,
      enterpriseAdjustments_TargetCurrency_t0: 0,
      evAdditive_Component_TargetCurrency_t0: null,
    };
  }

  const buildNeed_TargetCurrency = buildFundingNeedUSD * input.fx_USD_to_TargetCurrency;

  const cash_available = cashT0;
  const percentageCap = cash_available * cashUsedPercent;
  const cash_cap = Math.min(input.financingPlan?.cash_use_cap_TargetCurrency ?? cash_available, percentageCap);
  const cash_usable = Math.min(cash_available, cash_cap);

  const legacyCashUsed = input.cashUsedForProjectFinancing_TargetCurrency_t0;
  const cash_used_for_build_TargetCurrency =
    legacyCashUsed != null
      ? Math.min(Math.max(legacyCashUsed, 0), buildNeed_TargetCurrency, cash_usable)
      : use_cash_first
        ? Math.min(cash_usable, buildNeed_TargetCurrency)
        : 0;

  const cash_t0_post_TargetCurrency = cash_available - cash_used_for_build_TargetCurrency;

  const remainingNeed = Math.max(0, buildNeed_TargetCurrency - cash_used_for_build_TargetCurrency);

  const new_debt_TargetCurrency = remainingNeed * debt_fraction;
  const equity_raised_TargetCurrency = remainingNeed * equity_fraction;

  let new_shares: number | null = null;
  let shares_post_financing: number | null = null;

  if (input.shares_current === null) {
    shares_post_financing = null;
  } else if (equity_raised_TargetCurrency > 0) {
    if (!isFiniteNumber(raisePriceRaw) || raisePriceRaw <= 0) {
      throw new Error('A positive equity raise price is required when equity is raised');
    }
    new_shares = equity_raised_TargetCurrency / raisePriceRaw;
    shares_post_financing = input.shares_current + new_shares;
  } else {
    new_shares = 0;
    shares_post_financing = input.shares_current;
  }

  const debt_existing = debtT0;
  const debt_t0_post_TargetCurrency = debt_existing + new_debt_TargetCurrency;
  const netCash_TargetCurrency_t0 = cash_t0_post_TargetCurrency - debt_t0_post_TargetCurrency;

  const NAV_today_TargetCurrency =
    NPV_today_TargetCurrency === null
      ? null
      : NPV_today_TargetCurrency + (cash_t0_post_TargetCurrency - debt_t0_post_TargetCurrency);

  // MVI definition: use market-now equity (shares_current * current price) to avoid inventing post-raise price.
  const equity_now =
    isFiniteNumber(input.shares_current) && isFiniteNumber(input.price_current_TargetCurrency)
      ? input.shares_current * input.price_current_TargetCurrency
      : null;

  const Debt_to_Equity_ratio =
    equity_now !== null && equity_now > 0 ? debt_t0_post_TargetCurrency / equity_now : null;

  return {
    latest_quarterly_cash_TargetCurrency: cash_available,
    cash_used_percent: cashUsedPercent,
    remaining_funding_need_TargetCurrency: remainingNeed,
    cash_used_for_build_TargetCurrency,
    cash_t0_post_TargetCurrency,
    new_debt_TargetCurrency,
    debt_t0_post_TargetCurrency,
    equity_raised_TargetCurrency,
    new_shares,
    shares_post_financing,
    NPV_today_TargetCurrency,
    NAV_today_TargetCurrency,
    Debt_to_Equity_ratio,
    npvToday_TargetCurrency: NPV_today_TargetCurrency,
    navToday_TargetCurrency: NAV_today_TargetCurrency,
    cash_AfterCashFirst_TargetCurrency_t0: cash_t0_post_TargetCurrency,
    debt_TargetCurrency_t0: debt_t0_post_TargetCurrency,
    netCash_TargetCurrency_t0,
    enterpriseAdjustments_TargetCurrency_t0: 0,
    evAdditive_Component_TargetCurrency_t0: debt_t0_post_TargetCurrency - cash_t0_post_TargetCurrency,
  };
}
