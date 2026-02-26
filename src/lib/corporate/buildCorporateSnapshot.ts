import { aggregateProjectsCorporateV1 } from './aggregateProjects.ts';
import { computeCorporateFinancing } from './financing/compute.ts';
import { deriveBuildFundingNeedUSD } from './financing/deriveBuildFundingNeed.ts';
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

  const buildFundingNeed_USD =
    input.financingInput.buildFundingNeed_USD === undefined
      ? deriveBuildFundingNeedUSD({
          corporatePeriodEndDatesUtc: aggregation.corporatePeriodEndDatesUtc,
          capexUSD_total: aggregation.capexUSD_total,
          projects: input.aggregationInput.projects.map((project) => {
            const raw = project.rawJson as {
              time?: {
                productionStartPeriod?: number;
                periodEndDatesUtc?: string[];
              };
            };
            const productionStartPeriodRaw = raw.time?.productionStartPeriod;
            const periodEndDatesUtc = raw.time?.periodEndDatesUtc;

            if (!Number.isInteger(productionStartPeriodRaw)) {
              throw new Error(`Project ${project.projectId} is missing integer time.productionStartPeriod`);
            }
            if (!Array.isArray(periodEndDatesUtc) || periodEndDatesUtc.length === 0) {
              throw new Error(`Project ${project.projectId} is missing non-empty time.periodEndDatesUtc`);
            }

            const productionStartPeriod = productionStartPeriodRaw as number;

            return {
              projectId: project.projectId,
              productionStartPeriod,
              periodEndDatesUtc,
            };
          }),
        })
      : input.financingInput.buildFundingNeed_USD;

  const financing = computeCorporateFinancing({
    ...input.financingInput,
    NPV_today_USD: aggregation.NPV_today_USD,
    buildFundingNeed_USD,
  });

  return {
    aggregation,
    financing,
  };
}
