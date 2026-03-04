import type { ParsedProjectJsonV1 } from '../project/jsonv1/parse.ts';
import type { ProjectEngineFullProductionV1Input, ProjectEngineFullProductionV1Output } from '../project/types.ts';
import type { ProjectJsonV1 } from '../project/jsonv1/schema.ts';

export type CorporateAggregationInput = {
  discountRate: number;
  projects: Array<{
    projectId: string;
    rawJson: unknown & Partial<ProjectJsonV1>;
  }>;
};

export type CorporateAggregationOutput = {
  corporateYearsByPeriod: number[];
  corporateMasterN: number;
  capexUSD_total: Array<number | null>;
  fcffUSD_total: Array<number | null>;
  grossRevenueUSD_total: Array<number | null>;
  auPriceUSDPerOz: Array<number | null>;
  sustainingCostUSD_total: Array<number | null>;
  payableAuEqOz_total: Array<number | null>;
  aiscAuEqUSDPerOz_LOM: number | null;
  CF_LOM_USD: number | null;
  NPV_today_USD: number | null;
  diagnostics: {
    projectCount: number;
    usedDatesCount: number;
    nullPeriods: number;
    notes: string[];
  };
};

export type CorporateProjectEngineSnapshot = {
  yearsByPeriod?: number[];
  capexUSD: Array<number | null>;
  fcffUSD: Array<number | null>;
  grossRevenueUSD: Array<number | null>;
  auPriceUSDPerOz: Array<number | null>;
  sustainingCostUSD: Array<number | null>;
  payableAuEqOz: Array<number | null>;
};

export type CorporateAggregationDeps = {
  parseProject?: (raw: unknown) => ParsedProjectJsonV1;
  resolvePrices?: (args: {
    parsed: ParsedProjectJsonV1;
    from: string;
    to: string;
  }) => Promise<ProjectEngineFullProductionV1Input>;
  runProjectEngine?: (resolvedInput: ProjectEngineFullProductionV1Input) => Pick<ProjectEngineFullProductionV1Output, 'capexUSD_used' | 'phase1' | 'aisc' | 'revenue'>;
  projectToSeries?: (args: { projectId: string; rawJson: unknown }) => Promise<CorporateProjectEngineSnapshot>;
};
