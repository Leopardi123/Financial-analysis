import type { ProjectJsonV1 } from './schema.ts';

export function getProjectJsonV1Template(): ProjectJsonV1 {
  const masterN = 5;
  const tp = 2;
  const len = masterN + 1;
  const nulls = Array(len).fill(null);

  return {
    version: 'project_json_v1',
    meta: {
      projectId: '',
      projectName: '',
      currency: 'USD',
      notes: '',
    },
    time: { masterN, productionStartPeriod: tp },
    economics: { taxRate: 0 },

    series: {
      capexUSD: [...nulls],
      operatingCostsUSD: [...nulls],
      sustainingCapexUSD: [...nulls],
      siteGandA_USD: [...nulls],
      royaltiesUSD: [...nulls],
      reclamationUSD: [...nulls],
      byproductCreditsUSD: [...nulls],
    },

    metals: {
      payableQtyByMetal: { Au: [...nulls] },
      spotPriceUSDByMetal: { Au: [...nulls] },
      auPriceUSDPerOz: [...nulls],
    },

    streamsByMetal: null,
    takeItems: [],

    operations: {
      capacity: { throughputUnit: 'tpd', nameplateThroughput: 10000, utilizationPct: null },
      oreMilledTonnes: [...nulls],
      oreMinedTonnes: [...nulls],
    },
  };
}
