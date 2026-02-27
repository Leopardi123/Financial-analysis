type NullableNumber = number | null;

export type Lista1FinancialValuationMetrics = {
  NPV_today_perShare_TargetCurrency: NullableNumber;
  NAV_today_perShare_TargetCurrency: NullableNumber;
  EVPS_TargetCurrency: NullableNumber;
};

export function makeNullLista1FinancialValuationMetrics(): Lista1FinancialValuationMetrics {
  return {
    NPV_today_perShare_TargetCurrency: null,
    NAV_today_perShare_TargetCurrency: null,
    EVPS_TargetCurrency: null,
  };
}

function toPerShare(value: number | null, shares: number | null): number | null {
  if (value === null || shares === null || !Number.isFinite(shares) || shares <= 0) {
    return null;
  }
  return value / shares;
}

export function computeLista1FinancialValuationMetrics(args: {
  npvToday_TargetCurrency: number | null;
  navToday_TargetCurrency: number | null;
  ev_TargetCurrency: number | null;
  shares_post_financing: number | null;
  shares_current: number | null;
}): Lista1FinancialValuationMetrics {
  return {
    NPV_today_perShare_TargetCurrency: toPerShare(args.npvToday_TargetCurrency, args.shares_post_financing),
    NAV_today_perShare_TargetCurrency: toPerShare(args.navToday_TargetCurrency, args.shares_post_financing),
    EVPS_TargetCurrency: toPerShare(args.ev_TargetCurrency, args.shares_current),
  };
}
