export type ProjectPhase1Input = {
  masterN: number;
  productionStartPeriod: number;
  taxRate?: number;
  capexUSD: (number | null)[];
  revenueUSD: (number | null)[];
  operatingCostsUSD: (number | null)[];
  sustainingCapexUSD: (number | null)[];
  royaltiesUSD: (number | null)[];
  siteGandA_USD: (number | null)[];
  reclamationUSD: (number | null)[];
  byproductCreditsUSD?: (number | null)[] | null;
};

export type ProjectPhase1Output = {
  sustainingCostUSD: (number | null)[];
  ebitUSD: (number | null)[];
  taxUSD: (number | null)[];
  nopatUSD: (number | null)[];
  fcffUSD: (number | null)[];
};

export type ProjectPhase2Input = {
  masterN: number;
  productionStartPeriod: number;
  discountRate: number;
  fcffUSD: (number | null)[];
};

export type ProjectPhase2Output = {
  dfToToday: (number | null)[];
  cfLOM_USD: number | null;
  npvToday_USD: number | null;
  dcfProdStart_exCapex_USD: number | null;
  dcfProdStart_present_USD: number | null;
  irr: number | null;
  npv_over_etlv: number | null;
  dcf_present_over_etlv: number | null;
};
