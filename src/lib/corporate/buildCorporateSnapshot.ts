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
          corporatePeriodEndDatesUtc: aggregation.corporatePeriodEndDatesUtc,
          capexUSD_total: aggregation.capexUSD_total,
          projects: input.aggregationInput.projects.map((project) => {
            const raw = project.rawJson as {
              version?: string;
              time?: {
                masterN?: number;
                productionStartPeriod?: number;
                productionStartYear?: number;
                periodEndDatesUtc?: string[];
              };
            };
            const productionStartPeriodRaw = raw.time?.productionStartPeriod;

            if (!Number.isInteger(productionStartPeriodRaw)) {
              throw new Error(`Project ${project.projectId} is missing integer time.productionStartPeriod`);
            }

            if (raw.version === 'project_json_v2') {
              const time = raw.time;
              if (!time || !Number.isInteger(time.masterN) || !Number.isInteger(time.productionStartYear)) {
                throw new Error(`Project ${project.projectId} is missing required v2 time fields {masterN, productionStartPeriod, productionStartYear}.`);
              }

              const resolved = resolveV2TimeAxis({
                masterN: time.masterN as number,
                productionStartPeriod: productionStartPeriodRaw as number,
                productionStartYear: time.productionStartYear as number,
              });

              return {
                projectId: project.projectId,
                productionStartPeriod: productionStartPeriodRaw as number,
                periodEndDatesUtc: resolved.yearsByPeriod.map((year) => `${year}-12-31`),
              };
            }

            const periodEndDatesUtc = raw.time?.periodEndDatesUtc;
            if (!Array.isArray(periodEndDatesUtc) || periodEndDatesUtc.length === 0) {
              throw new Error(`Project ${project.projectId} is missing non-empty time.periodEndDatesUtc`);
            }

            return {
              projectId: project.projectId,
              productionStartPeriod: productionStartPeriodRaw as number,
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
