export type KeyMetricRow = { key: string; label: string; value: unknown };
export type KeyMetricSection = { id: 'lista1' | 'lista2' | 'lista3' | 'lista4' | 'lista5'; title: string; rows: KeyMetricRow[] };

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rPct(discountRate: number | null): number {
  if (discountRate === null || !Number.isFinite(discountRate)) return 0;
  return Math.round(discountRate * 100);
}

function labelFor(key: string, discountRate: number | null): string {
  const r = rPct(discountRate);
  const map: Record<string, string> = {
    NPV_today_TargetCurrency: `NPV (r=${r} %) nu`,
    NPV_today_perShare_TargetCurrency: `NPV (r=${r} %) nu / aktie`,
    NAV_today_TargetCurrency: `NAV (r=${r} %) nu`,
    NAV_today_perShare_TargetCurrency: `NAV (r=${r} %) nu / aktie`,
    DCF_prodStart_exCapex_TargetCurrency: 'DCF (prodstart, ex capex)',
    DCF_prodStart_exCapex_perShare_TargetCurrency: 'DCF (prodstart, ex capex) / aktie',
    DCF_prodStart_present_TargetCurrency: 'DCF (prodstart) nu',
    DCF_prodStart_present_perShare_TargetCurrency: 'DCF (prodstart) nu / aktie',
    CF_LOM_TargetCurrency: 'CF LOM (odiskonterad)',
    CF_LOM_perShare_TargetCurrency: 'CF LOM / aktie (odiskonterad)',
    EV_TargetCurrency: 'EV',
    EVPS_TargetCurrency: 'EV / aktie',
    EV_over_NPV: `EV / NPV (r=${r} %)`,
    EV_over_NAV: `EV / NAV (r=${r} %)`,
    P_over_NAV: `P / NAV (r=${r} %)`,
    NPV_over_ETLV: 'NPV / ETLV',
    DCF_present_over_ETLV: 'DCF (nu) / ETLV',

    Time_to_production: 'Tid till produktion (tp)',
    LOM_periods: 'LOM (antal perioder)',
    LOM_production_AuEq_Oz: 'LOM produktion (AuEq oz)',
    Annual_production_AuEq_Oz: 'Årsproduktion (AuEq oz)',
    AISC_AuEq_USD_per_Oz_LOM: 'AISC AuEq / oz (LOM)',
    CAPEX_per_annual_AuEq_Oz: 'CAPEX / årsproduktion AuEq',

    Payback_approx_years: 'Payback (approx, år)',
    Payback_real_years: 'Payback (real, år)',
    LOM_average_EBIT_ROCE_pct: 'LOM genomsnitt EBIT ROCE %',
    LOM_discounted_EBIT_ROCE_pct: `LOM diskonterad EBIT ROCE % (r=${r} %)`,
    ROI_10Y_pct: 'ROI 10Y %',
    Kapitalavkastning_LOM: 'Kapitalavkastning LOM',
    Kapitalavkastning_per_Ar_LOM: 'Kapitalavkastning / år (LOM)',
    GA_total_TargetCurrency: 'G&A total',
    GA_per_revenue: 'G&A / intäkt',
    VCE_total_TargetCurrency: 'VCE total',
    VCE_per_revenue: 'VCE / intäkt',
    capital_return_on_build: 'Kapitalavkastning på byggnation',
    capital_return_10Y: 'Kapitalavkastning 10Y',

    Revenue_10Y_TargetCurrency: 'Intäkt 10Y (strict)',
    FCFF_10Y_TargetCurrency: 'FCFF 10Y (strict)',
    AuEq_Oz_10Y: 'AuEq 10Y (oz)',
    InSituValue_10Y_TargetCurrency: 'Insitu värde 10Y',
    InSituValue_perShare_10Y_TargetCurrency: 'Insitu värde 10Y / aktie',
    Revenue_10Y_perShare_TargetCurrency: 'Intäkt 10Y / aktie',
    FCFF_10Y_perShare_TargetCurrency: 'FCFF 10Y / aktie',
    EV_over_Revenue_10Y: 'EV / Intäkt 10Y',

    Debt_to_Equity_ratio: 'Skuld / Eget kapital',
    cash_t0_post_TargetCurrency: 'Kassa t0 (efter finansiering)',
    debt_t0_post_TargetCurrency: 'Skuld t0 (efter finansiering)',
    new_debt_TargetCurrency: 'Ny skuld',
    equity_raised_TargetCurrency: 'Nytt eget kapital',
    new_shares: 'Nya aktier',
    shares_post_financing: 'Aktier efter finansiering',
  };
  return map[key] ?? key;
}

export function formatProjectMetricValue(key: string, value: unknown): string {
  const numeric = asNumber(value);
  if (numeric === null) return '—';

  const ratioKeys = new Set([
    'EV_over_NPV', 'EV_over_NAV', 'P_over_NAV', 'NPV_over_ETLV', 'DCF_present_over_ETLV',
    'GA_per_revenue', 'VCE_per_revenue', 'Debt_to_Equity_ratio', 'EV_over_Revenue_10Y',
    'capital_return_on_build', 'capital_return_10Y', 'Kapitalavkastning_LOM', 'Kapitalavkastning_per_Ar_LOM',
  ]);

  if (ratioKeys.has(key) || key.endsWith('_pct')) {
    return numeric.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }

  if (key.includes('shares') || key.includes('Oz') || key.includes('period') || key.includes('production') || key.includes('Payback')) {
    return numeric.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  }

  return numeric.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function top(snapshot: Record<string, unknown> | null, key: string): unknown {
  return snapshot?.[key] ?? null;
}

function financing(snapshot: Record<string, unknown> | null, key: string): unknown {
  const fin = (snapshot?.financing ?? null) as Record<string, unknown> | null;
  return fin?.[key] ?? null;
}

export function buildProjectKeyMetricsSections(args: {
  snapshot: Record<string, unknown> | null;
  discountRate: number | null;
}): { market: Array<{ label: string; value: unknown; key: string }>; sections: KeyMetricSection[] } {
  const s = args.snapshot;
  const sharesPost = asNumber(financing(s, 'shares_post_financing'));
  const newShares = asNumber(financing(s, 'new_shares'));
  const sharesCurrent = sharesPost !== null && newShares !== null ? sharesPost - newShares : null;

  const makeRows = (keys: string[]): KeyMetricRow[] => keys.map((key) => ({ key, label: labelFor(key, args.discountRate), value: top(s, key) }));

  const sections: KeyMetricSection[] = [
    {
      id: 'lista1',
      title: 'Lista 1 — Finansiella nyckeltal och värdering',
      rows: makeRows([
        'NPV_today_TargetCurrency', 'NPV_today_perShare_TargetCurrency', 'NAV_today_TargetCurrency', 'NAV_today_perShare_TargetCurrency',
        'DCF_prodStart_exCapex_TargetCurrency', 'DCF_prodStart_exCapex_perShare_TargetCurrency',
        'DCF_prodStart_present_TargetCurrency', 'DCF_prodStart_present_perShare_TargetCurrency',
        'CF_LOM_TargetCurrency', 'CF_LOM_perShare_TargetCurrency',
        'EV_TargetCurrency', 'EVPS_TargetCurrency', 'EV_over_NPV', 'EV_over_NAV', 'P_over_NAV', 'NPV_over_ETLV', 'DCF_present_over_ETLV',
      ]),
    },
    {
      id: 'lista2',
      title: 'Lista 2 — Produktion och operativt',
      rows: makeRows([
        'Time_to_production', 'LOM_periods', 'LOM_production_AuEq_Oz', 'Annual_production_AuEq_Oz', 'AISC_AuEq_USD_per_Oz_LOM', 'CAPEX_per_annual_AuEq_Oz',
      ]),
    },
    {
      id: 'lista3',
      title: 'Lista 3 — Effektivitet och lönsamhet',
      rows: makeRows([
        'Payback_approx_years', 'Payback_real_years', 'LOM_average_EBIT_ROCE_pct', 'LOM_discounted_EBIT_ROCE_pct', 'ROI_10Y_pct',
        'Kapitalavkastning_LOM', 'Kapitalavkastning_per_Ar_LOM',
        'GA_total_TargetCurrency', 'GA_per_revenue', 'VCE_total_TargetCurrency', 'VCE_per_revenue', 'capital_return_on_build', 'capital_return_10Y',
      ]),
    },
    {
      id: 'lista4',
      title: 'Lista 4 — Insitu 10Y (strict)',
      rows: makeRows([
        'Revenue_10Y_TargetCurrency', 'FCFF_10Y_TargetCurrency', 'AuEq_Oz_10Y', 'InSituValue_10Y_TargetCurrency',
        'InSituValue_perShare_10Y_TargetCurrency', 'Revenue_10Y_perShare_TargetCurrency', 'FCFF_10Y_perShare_TargetCurrency', 'EV_over_Revenue_10Y',
      ]),
    },
    {
      id: 'lista5',
      title: 'Lista 5 — Finansiering och leverage',
      rows: [
        { key: 'Debt_to_Equity_ratio', label: labelFor('Debt_to_Equity_ratio', args.discountRate), value: financing(s, 'Debt_to_Equity_ratio') },
        { key: 'cash_t0_post_TargetCurrency', label: labelFor('cash_t0_post_TargetCurrency', args.discountRate), value: financing(s, 'cash_t0_post_TargetCurrency') },
        { key: 'debt_t0_post_TargetCurrency', label: labelFor('debt_t0_post_TargetCurrency', args.discountRate), value: financing(s, 'debt_t0_post_TargetCurrency') },
        { key: 'new_debt_TargetCurrency', label: labelFor('new_debt_TargetCurrency', args.discountRate), value: financing(s, 'new_debt_TargetCurrency') },
        { key: 'equity_raised_TargetCurrency', label: labelFor('equity_raised_TargetCurrency', args.discountRate), value: financing(s, 'equity_raised_TargetCurrency') },
        { key: 'new_shares', label: labelFor('new_shares', args.discountRate), value: financing(s, 'new_shares') },
        { key: 'shares_post_financing', label: labelFor('shares_post_financing', args.discountRate), value: financing(s, 'shares_post_financing') },
      ],
    },
  ];

  return {
    market: [
      { key: 'MarketCap_TargetCurrency', label: 'Market Cap', value: top(s, 'MarketCap_TargetCurrency') },
      { key: 'shares_current', label: 'Aktier nuvarande', value: sharesCurrent },
      { key: 'shares_post_financing', label: 'Aktier efter finansiering', value: sharesPost },
      { key: 'EV_TargetCurrency', label: 'EV', value: top(s, 'EV_TargetCurrency') },
    ],
    sections,
  };
}
