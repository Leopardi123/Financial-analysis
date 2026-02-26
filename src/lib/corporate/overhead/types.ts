export type CorporateOverheadOverlayInput = {
  masterN: number;
  discountRate: number;
  fcffUSD_total: (number | null)[];
  corpGA_cash_USD: (number | null)[];
  corpSBC_USD: (number | null)[];
};

export type CorporateOverheadOverlayOutput = {
  overheadUSD: (number | null)[];
  fcffUSD_after_overhead: (number | null)[];
  npvToday_USD_before: number | null;
  npvToday_USD_after_overhead: number | null;
  overheadNPVDrag_USD: number | null;
};
