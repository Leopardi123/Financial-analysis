export type ProjectAiscInput = {
  masterN: number;
  productionStartPeriod: number;
  grossRevenueUSD: (number | null)[];
  auPriceUSDPerOz: (number | null)[];
  sustainingCostUSD: (number | null)[];
};

export type ProjectAiscOutput = {
  payableAuEqOz: (number | null)[];
  lomPeriods: number | null;
  aiscAuEqUSDPerOz_LOM: number | null;
};
