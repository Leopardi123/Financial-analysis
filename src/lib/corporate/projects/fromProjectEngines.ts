import { computeCorporateProjects } from './engine.ts';
import type { CorporateProjectsOutput } from './types.ts';
import type { ProjectEngineFullProductionV1Output } from '../../project/types.ts';

export type CorporateFromProjectsInput = {
  discountRate: number;
  masterN: number;
  projects: Array<{
    id: string;
    productionStartPeriod: number;
    out: ProjectEngineFullProductionV1Output;
  }>;
};

function getPhase1ProductionStartPeriod(out: ProjectEngineFullProductionV1Output): number | null {
  const value = (out.phase1 as { productionStartPeriod?: unknown }).productionStartPeriod;
  return Number.isInteger(value) ? (value as number) : null;
}

function assertSeriesLength(series: (number | null)[], expectedLength: number, projectId: string, field: string): void {
  if (series.length !== expectedLength) {
    throw new Error(`Project ${projectId} field ${field} length must be ${expectedLength}`);
  }
}

export function computeCorporateFromProjectEngines(input: CorporateFromProjectsInput): CorporateProjectsOutput {
  if (input.projects.length < 1) {
    throw new Error('At least one project is required');
  }

  const expectedLength = input.masterN + 1;

  const projects = input.projects.map((project) => {
    if (!Number.isInteger(project.productionStartPeriod)) {
      throw new Error(`Project ${project.id} has non-integer productionStartPeriod`);
    }

    const phase1Tp = getPhase1ProductionStartPeriod(project.out);
    if (phase1Tp !== null && phase1Tp !== project.productionStartPeriod) {
      throw new Error(
        `Project ${project.id} productionStartPeriod mismatch: input=${project.productionStartPeriod} out.phase1=${phase1Tp}`,
      );
    }

    const grossRevenueUSD = project.out.revenue.grossRevenueUSD;
    const capexUSD = project.out.capexUSD_used;
    const fcffUSD = project.out.phase1.fcffUSD;
    const sustainingCostUSD = project.out.phase1.sustainingCostUSD;
    const payableAuEqOz = project.out.aisc.payableAuEqOz;

    assertSeriesLength(grossRevenueUSD, expectedLength, project.id, 'grossRevenueUSD');
    assertSeriesLength(capexUSD, expectedLength, project.id, 'capexUSD');
    assertSeriesLength(fcffUSD, expectedLength, project.id, 'fcffUSD');
    assertSeriesLength(sustainingCostUSD, expectedLength, project.id, 'sustainingCostUSD');
    assertSeriesLength(payableAuEqOz, expectedLength, project.id, 'payableAuEqOz');

    return {
      id: project.id,
      productionStartPeriod: project.productionStartPeriod,
      grossRevenueUSD,
      capexUSD,
      fcffUSD,
      sustainingCostUSD,
      payableAuEqOz,
    };
  });

  return computeCorporateProjects({
    masterN: input.masterN,
    discountRate: input.discountRate,
    projects,
  });
}
