export type CorporateEquityFinancingInput = {
  shares_current: number | null;

  equityNeeded_TargetCurrency: number | null; // cash amount to be raised via equity
  equityRaisePrice_TargetCurrency_perShare: number | null; // issue price per share

  // optional controls:
  roundToWholeShares?: boolean | null; // default true
};

export type CorporateEquityFinancingOutput = {
  shares_current: number | null;
  equityNeeded_TargetCurrency: number | null;
  equityRaisePrice_TargetCurrency_perShare: number | null;

  newShares: number | null;
  shares_post_financing: number | null;
};
