export type CorporatePerShareInput = {
  shares_post_financing: number | null;

  // internal valuation outputs in TargetCurrency
  npvToday_TargetCurrency: number | null;
  navToday_TargetCurrency: number | null;

  // optional internal cashflow totals
  cfLOM_TargetCurrency?: number | null;
  dcfProdStart_present_TargetCurrency?: number | null;
};

export type CorporatePerShareOutput = {
  npvToday_perShare_TargetCurrency: number | null;
  navToday_perShare_TargetCurrency: number | null;
  cfLOM_perShare_TargetCurrency: number | null;
  dcfProdStart_present_perShare_TargetCurrency: number | null;
};
