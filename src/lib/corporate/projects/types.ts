export type CorporateProjectsInput = {
  masterN: number;
  projects: Array<{
    id: string;
    productionStartPeriod: number;
    grossRevenueUSD: (number | null)[];
    capexUSD: (number | null)[];
    fcffUSD: (number | null)[];
    sustainingCostUSD: (number | null)[];
    payableAuEqOz: (number | null)[];
    npvToday_USD?: number | null;
    cfLOM_USD?: number | null;
  }>;
};

export type CorporateProjectsOutput = {
  grossRevenueUSD_total: (number | null)[];
  capexUSD_total: (number | null)[];
  fcffUSD_total: (number | null)[];
  sustainingCostUSD_total: (number | null)[];

  cfLOM_USD_total: number | null;
  npvToday_USD_total: number | null;

  payableAuEqOz_total_included: number | null;
  sustainingCostUSD_total_included: number | null;
  aiscAuEqUSDPerOz_LOM_corp: number | null;
};
