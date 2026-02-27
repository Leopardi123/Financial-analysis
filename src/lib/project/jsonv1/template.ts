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
    time: {
      masterN,
      productionStartPeriod: tp,
      periodEndDatesUtc: ['2026-12-31', '2027-12-31', '2028-12-31', '2029-12-31', '2030-12-31', '2031-12-31'],
    },
    economics: { taxRate: 0 },

    series: {
      capexUSD: [...nulls],
      operatingCostsUSD: [...nulls],
      sustainingCapexUSD: [...nulls],
      siteGandA_USD: [...nulls],
      workingCapitalDeltaUSD: [...nulls],
      royaltiesUSD: [...nulls],
      reclamationUSD: [...nulls],
      byproductCreditsUSD: [...nulls],
    },

    metals: {
      payableQtyByMetal: {
        Au: [...nulls],
        Cu: [...nulls],
      },
      payableQtyUnitByMetal: {
        Au: 'toz',
        Cu: 'lb',
      },
      priceKeyByMetal: {
        Au: 'XAU_USD_TOZ',
        Cu: 'CU_USD_LB',
      },
      auPriceKey: 'XAU_USD_TOZ',
    },

    streamsByMetal: null,
    takeItems: [],

    operations: {
      capacity: { throughputUnit: 'tpd', nameplateThroughput: 10000, utilizationPct: null },
      oreMilledTonnes: [...nulls],
      oreMinedTonnes: [...nulls],
      oreTonnageUnit: 'tonne',
    },

    economicsBreakdown: {
      cogs: {
        miningUSD: [...nulls],
        millingUSD: [...nulls],
        utilitiesUSD: [...nulls],
        maintenanceUSD: [...nulls],
        campUSD: [...nulls],
        siteGandA_USD: [...nulls],
      },
      selling: {
        treatmentChargesUSD: [...nulls],
        refiningChargesUSD: [...nulls],
        tcRcUSD: [...nulls],
        transportUSD: [...nulls],
      },
      royaltiesDetail: [],
      taxesDetail: null,
    },
  };
}
