export type Lista4TenYearMetrics = {
  Revenue_10Y_USD: number | null;
  FCFF_10Y_USD: number | null;
  AuEq_Oz_10Y: number | null;
  InSituValue_10Y_USD: number | null;
  InSituValue_perShare_10Y_USD: number | null;

  Revenue_10Y_TargetCurrency: number | null;
  FCFF_10Y_TargetCurrency: number | null;
  InSituValue_10Y_TargetCurrency: number | null;
  InSituValue_perShare_10Y_TargetCurrency: number | null;
  Revenue_10Y_perShare_TargetCurrency: number | null;
  FCFF_10Y_perShare_TargetCurrency: number | null;
  EV_over_Revenue_10Y: number | null;

  in_situ_value_TargetCurrency: number | null;
  in_situ_value_per_share_TargetCurrency: number | null;

  BookValue_USD: number | null;
  BookValue_perShare_USD_shares_current: number | null;
  BookValue_perShare_USD_shares_post_financing: number | null;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function strictSum(series: Array<number | null>, t0: number, t1: number): number | null {
  let total = 0;
  for (let t = t0; t <= t1; t += 1) {
    const v = series[t];
    if (!finite(v)) {
      return null;
    }
    total += v;
  }
  return total;
}

function strictAuEqSum(revenueSeries: Array<number | null>, auPriceSeries: Array<number | null>, t0: number, t1: number): number | null {
  let total = 0;
  for (let t = t0; t <= t1; t += 1) {
    const r = revenueSeries[t];
    const p = auPriceSeries[t];
    if (!finite(r) || !finite(p) || p <= 0) {
      return null;
    }
    total += r / p;
  }
  return total;
}

export function makeNullLista4TenYearMetrics(): Lista4TenYearMetrics {
  return {
    Revenue_10Y_USD: null,
    FCFF_10Y_USD: null,
    AuEq_Oz_10Y: null,
    InSituValue_10Y_USD: null,
    InSituValue_perShare_10Y_USD: null,
    Revenue_10Y_TargetCurrency: null,
    FCFF_10Y_TargetCurrency: null,
    InSituValue_10Y_TargetCurrency: null,
    InSituValue_perShare_10Y_TargetCurrency: null,
    Revenue_10Y_perShare_TargetCurrency: null,
    FCFF_10Y_perShare_TargetCurrency: null,
    EV_over_Revenue_10Y: null,
    in_situ_value_TargetCurrency: null,
    in_situ_value_per_share_TargetCurrency: null,
    BookValue_USD: null,
    BookValue_perShare_USD_shares_current: null,
    BookValue_perShare_USD_shares_post_financing: null,
  };
}

export function computeLista4TenYearMetrics(args: {
  masterN: number;
  revenueUSD_total: Array<number | null>;
  fcffUSD_total: Array<number | null>;
  auPriceUSDPerOz: Array<number | null>;
  fx_USD_to_TargetCurrency: number | null;
  shares_current: number | null;
  shares_post_financing: number | null;
  ev_TargetCurrency: number | null;
  totalStockholdersEquity_USD: number | null;
}): Lista4TenYearMetrics {
  const out = makeNullLista4TenYearMetrics();
  const t1 = Math.min(args.masterN, 9);
  if (t1 < 0) {
    return out;
  }

  out.Revenue_10Y_USD = strictSum(args.revenueUSD_total, 0, t1);
  out.FCFF_10Y_USD = strictSum(args.fcffUSD_total, 0, t1);
  out.InSituValue_10Y_USD = strictSum(args.revenueUSD_total, 0, t1);
  out.AuEq_Oz_10Y = strictAuEqSum(args.revenueUSD_total, args.auPriceUSDPerOz, 0, t1);

  if (finite(out.InSituValue_10Y_USD) && finite(args.shares_post_financing) && args.shares_post_financing !== 0) {
    out.InSituValue_perShare_10Y_USD = out.InSituValue_10Y_USD / args.shares_post_financing;
  }

  if (finite(args.fx_USD_to_TargetCurrency)) {
    if (finite(out.Revenue_10Y_USD)) out.Revenue_10Y_TargetCurrency = out.Revenue_10Y_USD * args.fx_USD_to_TargetCurrency;
    if (finite(out.FCFF_10Y_USD)) out.FCFF_10Y_TargetCurrency = out.FCFF_10Y_USD * args.fx_USD_to_TargetCurrency;
    if (finite(out.InSituValue_10Y_USD)) out.InSituValue_10Y_TargetCurrency = out.InSituValue_10Y_USD * args.fx_USD_to_TargetCurrency;
    if (finite(out.InSituValue_perShare_10Y_USD)) out.InSituValue_perShare_10Y_TargetCurrency = out.InSituValue_perShare_10Y_USD * args.fx_USD_to_TargetCurrency;
  }

  if (finite(out.Revenue_10Y_TargetCurrency) && out.Revenue_10Y_TargetCurrency !== 0 && finite(args.ev_TargetCurrency)) {
    out.EV_over_Revenue_10Y = args.ev_TargetCurrency / out.Revenue_10Y_TargetCurrency;
  }

  if (finite(out.Revenue_10Y_TargetCurrency) && finite(args.shares_post_financing) && args.shares_post_financing !== 0) {
    out.Revenue_10Y_perShare_TargetCurrency = out.Revenue_10Y_TargetCurrency / args.shares_post_financing;
  }
  if (finite(out.FCFF_10Y_TargetCurrency) && finite(args.shares_post_financing) && args.shares_post_financing !== 0) {
    out.FCFF_10Y_perShare_TargetCurrency = out.FCFF_10Y_TargetCurrency / args.shares_post_financing;
  }

  out.in_situ_value_TargetCurrency = out.InSituValue_10Y_TargetCurrency;
  out.in_situ_value_per_share_TargetCurrency = out.InSituValue_perShare_10Y_TargetCurrency;

  out.BookValue_USD = finite(args.totalStockholdersEquity_USD) ? args.totalStockholdersEquity_USD : null;
  if (finite(out.BookValue_USD) && finite(args.shares_current) && args.shares_current !== 0) {
    out.BookValue_perShare_USD_shares_current = out.BookValue_USD / args.shares_current;
  }
  if (finite(out.BookValue_USD) && finite(args.shares_post_financing) && args.shares_post_financing !== 0) {
    out.BookValue_perShare_USD_shares_post_financing = out.BookValue_USD / args.shares_post_financing;
  }

  return out;
}
