export type CorporateTotalsProjectSeries = {
  capexUSD?: Array<number | null>;
  fcfUSD?: Array<number | null>;
  operatingCostsUSD?: Array<number | null>;
  sustainingCapexUSD?: Array<number | null>;
  siteGandA_USD?: Array<number | null>;
  royaltiesUSD?: Array<number | null>;
  reclamationAccrualUSD?: Array<number | null>;
  payable_AuEq_Oz?: Array<number | null>;
  sustainingCostUSD?: Array<number | null>;
};

export type CorporateTotalsSeries = {
  capexUSD_total: Array<number | null>;
  fcfUSD_total: Array<number | null>;
  operatingCostsUSD_total?: Array<number | null>;
  sustainingCapexUSD_total?: Array<number | null>;
  siteGandA_USD_total?: Array<number | null>;
  royaltiesUSD_total?: Array<number | null>;
  reclamationAccrualUSD_total?: Array<number | null>;
  payable_AuEq_Oz_total?: Array<number | null>;
  sustainingCostUSD_total?: Array<number | null>;
};

function atOrZero(series: Array<number | null> | undefined, t: number): number | null {
  if (!series || t >= series.length) {
    return 0;
  }
  const value = series[t];
  return value === undefined ? null : value;
}

function hasAnySeries(projects: CorporateTotalsProjectSeries[], selector: (project: CorporateTotalsProjectSeries) => Array<number | null> | undefined): boolean {
  return projects.some((project) => Array.isArray(selector(project)));
}

function sumStrict(projects: CorporateTotalsProjectSeries[], masterN: number, selector: (project: CorporateTotalsProjectSeries) => Array<number | null> | undefined): Array<number | null> {
  return Array.from({ length: masterN + 1 }, (_, t) => {
    let sum = 0;
    for (const project of projects) {
      const value = atOrZero(selector(project), t);
      if (value === null) {
        return null;
      }
      sum += value;
    }
    return sum;
  });
}

function buildSustainingCostSeries(project: CorporateTotalsProjectSeries, masterN: number): Array<number | null> {
  if (Array.isArray(project.sustainingCostUSD)) {
    return project.sustainingCostUSD;
  }

  const components = [
    project.operatingCostsUSD,
    project.sustainingCapexUSD,
    project.siteGandA_USD,
    project.royaltiesUSD,
    project.reclamationAccrualUSD,
  ];

  if (!components.some((series) => Array.isArray(series))) {
    return new Array<number | null>(masterN + 1).fill(0);
  }

  return Array.from({ length: masterN + 1 }, (_, t) => {
    let sum = 0;
    for (const component of components) {
      const value = atOrZero(component, t);
      if (value === null) {
        return null;
      }
      sum += value;
    }
    return sum;
  });
}

export function aggregateProjectsToCorporateTotals(
  projects: CorporateTotalsProjectSeries[],
  masterN: number,
): CorporateTotalsSeries {
  const totals: CorporateTotalsSeries = {
    capexUSD_total: sumStrict(projects, masterN, (project) => project.capexUSD),
    fcfUSD_total: sumStrict(projects, masterN, (project) => project.fcfUSD),
  };

  if (hasAnySeries(projects, (project) => project.operatingCostsUSD)) {
    totals.operatingCostsUSD_total = sumStrict(projects, masterN, (project) => project.operatingCostsUSD);
  }
  if (hasAnySeries(projects, (project) => project.sustainingCapexUSD)) {
    totals.sustainingCapexUSD_total = sumStrict(projects, masterN, (project) => project.sustainingCapexUSD);
  }
  if (hasAnySeries(projects, (project) => project.siteGandA_USD)) {
    totals.siteGandA_USD_total = sumStrict(projects, masterN, (project) => project.siteGandA_USD);
  }
  if (hasAnySeries(projects, (project) => project.royaltiesUSD)) {
    totals.royaltiesUSD_total = sumStrict(projects, masterN, (project) => project.royaltiesUSD);
  }
  if (hasAnySeries(projects, (project) => project.reclamationAccrualUSD)) {
    totals.reclamationAccrualUSD_total = sumStrict(projects, masterN, (project) => project.reclamationAccrualUSD);
  }
  if (hasAnySeries(projects, (project) => project.payable_AuEq_Oz)) {
    totals.payable_AuEq_Oz_total = sumStrict(projects, masterN, (project) => project.payable_AuEq_Oz);
  }

  if (
    hasAnySeries(projects, (project) => project.sustainingCostUSD)
    || hasAnySeries(projects, (project) => project.operatingCostsUSD)
    || hasAnySeries(projects, (project) => project.sustainingCapexUSD)
    || hasAnySeries(projects, (project) => project.siteGandA_USD)
    || hasAnySeries(projects, (project) => project.royaltiesUSD)
    || hasAnySeries(projects, (project) => project.reclamationAccrualUSD)
  ) {
    totals.sustainingCostUSD_total = sumStrict(
      projects.map((project) => ({
        ...project,
        sustainingCostUSD: buildSustainingCostSeries(project, masterN),
      })),
      masterN,
      (project) => project.sustainingCostUSD,
    );
  }

  return totals;
}
