import type { ProjectTakeMVIInput, ProjectTakeMVIOutput } from './take/types.ts';
import type { ProjectAiscOutput } from './aisc/types.ts';

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

export type ProjectEngineInput = {
  phase1: ProjectPhase1Input;
  phase2: {
    discountRate: number;
  };
};

export type ProjectEngineOutput = {
  phase1: ProjectPhase1Output;
  phase2: ProjectPhase2Output;
};

export type ProjectEngineWithTakeInput = {
  take: ProjectTakeMVIInput;
  phase1: Omit<ProjectPhase1Input, 'revenueUSD'> & {
    grossRevenueUSD: (number | null)[];
  };
  phase2: {
    discountRate: number;
  };
};

export type ProjectEngineWithTakeOutput = {
  take: ProjectTakeMVIOutput;
  phase1: ProjectPhase1Output;
  phase2: ProjectPhase2Output;
};

export type ProjectEngineWithAiscInput = {
  engine: ProjectEngineInput;
  aisc: {
    grossRevenueUSD: (number | null)[];
    auPriceUSDPerOz: (number | null)[];
  };
};

export type ProjectEngineWithAiscOutput = ProjectEngineOutput & {
  aisc: ProjectAiscOutput;
};

export type ProjectEngineWithTakeAndAiscInput = {
  engineWithTake: ProjectEngineWithTakeInput;
  aisc: {
    grossRevenueUSD: (number | null)[];
    auPriceUSDPerOz: (number | null)[];
  };
};

export type ProjectEngineWithTakeAndAiscOutput = ProjectEngineWithTakeOutput & {
  aisc: ProjectAiscOutput;
};
