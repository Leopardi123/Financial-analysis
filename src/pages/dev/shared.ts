import { getProjectJsonV1Template } from '../../lib/project/jsonv1/template.ts';
import type { ProjectJsonV1 } from '../../lib/project/jsonv1/schema.ts';

export function makeHarnessProjectJson(): ProjectJsonV1 {
  const template = getProjectJsonV1Template();
  const masterN = 2;
  const len = masterN + 1;

  return {
    ...template,
    meta: {
      ...template.meta,
      projectId: 'harness-project',
      projectName: 'Harness Project',
      notes: 'Deterministic sample for dev harness',
    },
    time: {
      masterN,
      productionStartPeriod: 1,
    },
    series: {
      ...template.series,
      capexUSD: [100, 40, 0],
      operatingCostsUSD: [0, 50, 50],
      sustainingCapexUSD: [0, 10, 10],
      siteGandA_USD: [0, 5, 5],
      royaltiesUSD: [0, 0, 0],
      reclamationUSD: [0, 0, 5],
      byproductCreditsUSD: [0, 0, 0],
    },
    metals: {
      payableQtyByMetal: {
        Au: [0, 100, 100],
      },
      spotPriceUSDByMetal: {
        Au: [2000, 2000, 2000],
      },
      auPriceUSDPerOz: [2000, 2000, 2000],
    },
    operations: {
      capacity: {
        throughputUnit: 'tpd',
        nameplateThroughput: 10000,
        utilizationPct: null,
      },
      oreMilledTonnes: new Array(len).fill(null),
      oreMinedTonnes: new Array(len).fill(null),
    },
    streamsByMetal: null,
    takeItems: [],
    economics: {
      taxRate: 0,
    },
  };
}

export function isDevAccessEnabled(): boolean {
  const search = new URLSearchParams(window.location.search);
  return search.get('dev') === '1';
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
