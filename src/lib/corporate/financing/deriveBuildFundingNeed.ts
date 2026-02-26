export function deriveBuildFundingNeedUSD(args: {
  corporatePeriodEndDatesUtc: string[];
  capexUSD_total: Array<number | null>;
  projects: Array<{
    projectId: string;
    productionStartPeriod: number;
    periodEndDatesUtc: string[];
  }>;
}): number | null {
  const { corporatePeriodEndDatesUtc, capexUSD_total, projects } = args;

  if (capexUSD_total.length !== corporatePeriodEndDatesUtc.length) {
    throw new Error('capexUSD_total length must match corporatePeriodEndDatesUtc length');
  }

  if (projects.length === 0) {
    throw new Error('Cannot derive build funding need without projects');
  }

  let corporateFirstProdDateUtc: string | null = null;

  for (const project of projects) {
    const { productionStartPeriod, periodEndDatesUtc, projectId } = project;
    if (!Number.isInteger(productionStartPeriod)) {
      throw new Error(`Project ${projectId} has non-integer productionStartPeriod`);
    }
    if (productionStartPeriod < 0 || productionStartPeriod >= periodEndDatesUtc.length) {
      throw new Error(`Project ${projectId} productionStartPeriod is out of range for periodEndDatesUtc`);
    }

    const prodDate = periodEndDatesUtc[productionStartPeriod];
    if (typeof prodDate !== 'string' || prodDate.length === 0) {
      throw new Error(`Project ${projectId} production start date is missing`);
    }

    if (corporateFirstProdDateUtc === null || prodDate < corporateFirstProdDateUtc) {
      corporateFirstProdDateUtc = prodDate;
    }
  }

  if (corporateFirstProdDateUtc === null) {
    throw new Error('Unable to derive corporate first production date');
  }

  let negativeCapexSum = 0;

  for (let t = 0; t < corporatePeriodEndDatesUtc.length; t += 1) {
    const periodEndDateUtc = corporatePeriodEndDatesUtc[t];
    if (periodEndDateUtc < corporateFirstProdDateUtc) {
      const capex = capexUSD_total[t];
      if (capex === null) {
        return null;
      }
      if (capex < 0) {
        negativeCapexSum += capex;
      }
    }
  }

  return Math.abs(negativeCapexSum);
}
