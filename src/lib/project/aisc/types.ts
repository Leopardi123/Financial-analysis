export type ProjectAiscInput = {
  masterN: number;
  productionStartPeriod: number; // tp
  grossRevenueUSD: (number | null)[];
  auPriceUSDPerOz: (number | null)[];
  sustainingCostUSD: (number | null)[];
};

export type ProjectAiscOutput = {
  payableAuEqOz: (number | null)[];
  lomPeriods: number;
  aiscAuEqUSDPerOz_LOM: number | null;
};
