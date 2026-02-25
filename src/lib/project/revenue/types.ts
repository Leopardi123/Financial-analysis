export type ProjectRevenueInput = {
  masterN: number;
  payableQtyByMetal: Record<string, (number | null)[]>;
  priceUSDByMetal: Record<string, (number | null)[]>;
};

export type ProjectRevenueOutput = {
  byMetalRevenueUSD: Record<string, (number | null)[]>;
  grossRevenueUSD: (number | null)[];
};
