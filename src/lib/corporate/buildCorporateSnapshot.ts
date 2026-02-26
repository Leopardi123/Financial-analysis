import { aggregateProjectsCorporateV1 } from './aggregateProjects.ts';
import { computeCorporateFinancing } from './financing/compute.ts';
import type { CorporateFinancingInput, CorporateFinancingOutput } from './financing/types.ts';
import type { CorporateAggregationDeps, CorporateAggregationInput, CorporateAggregationOutput } from './types.ts';

export type BuildCorporateSnapshotInput = {
  aggregationInput: CorporateAggregationInput;
  financingInput: Omit<CorporateFinancingInput, 'NPV_today_USD'>;
  aggregationDeps?: CorporateAggregationDeps;
};

export type BuildCorporateSnapshotOutput = {
  aggregation: CorporateAggregationOutput;
  financing: CorporateFinancingOutput;
};

export async function buildCorporateSnapshot(
  input: BuildCorporateSnapshotInput,
): Promise<BuildCorporateSnapshotOutput> {
  const aggregation = await aggregateProjectsCorporateV1(input.aggregationInput, input.aggregationDeps);

  const financing = computeCorporateFinancing({
    ...input.financingInput,
    NPV_today_USD: aggregation.NPV_today_USD,
    // TODO: derive buildFundingNeed_USD from aggregated capex schedule and production timing once spec is finalized.
  });

  return {
    aggregation,
    financing,
  };
}
