import { aggregateProjectsCorporateV1 } from './aggregateProjects.ts';
import { computeCorporateFinancing } from './financing/compute.ts';
import { deriveBuildFundingNeedUSD } from './financing/deriveBuildFundingNeed.ts';
import { resolveV2TimeAxis } from '../time/resolveV2TimeAxis.ts';
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
          yearsByPeriod: aggregation.corporateYearsByPeriod,
          masterN: aggregation.corporateMasterN,
          capexUSD_total: aggregation.capexUSD_total,
          projects: input.aggregationInput.projects.map((project) => {
            const raw = project.rawJson as {
              time?: {
                masterN?: number;
                productionStartPeriod?: number;
                productionStartYear?: number;
              };
            };

            const time = raw.time;
            if (!time || !Number.isInteger(time.masterN) || !Number.isInteger(time.productionStartPeriod) || !Number.isInteger(time.productionStartYear)) {
              throw new Error(
                `Invalid v2 time for project ${project.projectId}: masterN=${String(time?.masterN)}, productionStartPeriod=${String(time?.productionStartPeriod)}, productionStartYear=${String(time?.productionStartYear)}`,
              );
            }

            const resolved = resolveV2TimeAxis({
              masterN: time.masterN as number,
              productionStartPeriod: time.productionStartPeriod as number,
              productionStartYear: time.productionStartYear as number,
            });

            return {
              projectId: project.projectId,
              productionStartPeriod: resolved.productionStartPeriod,
              yearsByPeriod: resolved.yearsByPeriod,
              masterN: resolved.masterN,
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
