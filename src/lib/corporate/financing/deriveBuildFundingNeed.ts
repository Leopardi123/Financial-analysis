export function deriveBuildFundingNeedUSD(args: {
  yearsByPeriod: number[];
  masterN: number;
  capexUSD_total: Array<number | null>;
  projects: Array<{
    projectId: string;
    masterN: number;
    productionStartPeriod: number;
    yearsByPeriod: number[];
  }>;
  valuationYear?: number;
}): number | null {
  const { yearsByPeriod, masterN, capexUSD_total, projects } = args;

  if (yearsByPeriod.length !== masterN + 1) {
    throw new Error('yearsByPeriod length must equal masterN+1');
  }

  if (capexUSD_total.length !== yearsByPeriod.length) {
    throw new Error('capexUSD_total length must match yearsByPeriod length');
  }

  if (projects.length === 0) {
    throw new Error('Cannot derive build funding need without projects');
  }

  const valuationYear = args.valuationYear ?? new Date().getUTCFullYear();

  for (const project of projects) {
    const { productionStartPeriod, yearsByPeriod: projectYears, masterN: projectMasterN, projectId } = project;
    if (!Number.isInteger(projectMasterN) || projectMasterN < 0) {
      throw new Error(`Project ${projectId} has invalid masterN=${String(projectMasterN)}`);
    }
    if (projectYears.length !== projectMasterN + 1) {
      throw new Error(`Project ${projectId} yearsByPeriod length must equal masterN+1`);
    }
    if (!Number.isInteger(productionStartPeriod) || productionStartPeriod < 0 || productionStartPeriod >= projectYears.length) {
      throw new Error(`Project ${projectId} productionStartPeriod is out of range for yearsByPeriod`);
    }

    const productionYear = projectYears[productionStartPeriod];
    if (!Number.isFinite(productionYear)) {
      throw new Error(`Project ${projectId} production start year is missing`);
    }

  }

  let remainingCapexSpend = 0;

  for (let t = 0; t < yearsByPeriod.length; t += 1) {
    if (yearsByPeriod[t] >= valuationYear) {
      const capex = capexUSD_total[t];
      if (capex === null) {
        return null;
      }
      remainingCapexSpend += Math.abs(capex);
    }
  }

  return remainingCapexSpend;
}
