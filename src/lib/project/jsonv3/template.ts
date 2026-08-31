import type { ProjectJsonV3 } from './schema.ts';

export function buildProjectJsonV3Template(): ProjectJsonV3 & Record<string, unknown> {
  const currentYear = new Date().getUTCFullYear();
  const periodEndDatesUtc = Array.from({ length: 11 }, (_, index) => `${currentYear + index}-12-31`);
  return {
    version: 'project_json_v3',
    _description: 'Canonical single-source project economics. Every economic category has exactly one active source. Derived totals, NPV/IRR and C1/AISC must not be stored as parallel calculation inputs.',
    meta: {
      projectId: 'p1',
      projectName: '',
      currency: 'USD',
      notes: 'Unknown report data should remain null or use the appropriate aggregate mode. Never infer missing report semantics.',
    },
    time: {
      masterN: 10,
      productionStartPeriod: 2,
      periodEndDatesUtc,
      phaseByPeriod: ['construction', 'construction', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'operations', 'closure'],
    },
    metals: {
      payableQtyByMetal: { Au: new Array(11).fill(null) },
      payableQtyUnitByMetal: { Au: 'toz' },
      priceKeyByMetal: { Au: 'XAU_USD_TOZ' },
      auPriceKey: 'XAU_USD_TOZ',
    },
    streamsByMetal: null,
    economics: {
      costModel: {
        mode: 'AGGREGATE',
        operatingCostsUSD: new Array(11).fill(null),
        siteGandA_USD: new Array(11).fill(0),
      },
      sellingModel: { mode: 'NONE' },
      royaltyModel: { mode: 'NONE' },
      taxModel: { mode: 'FLAT_RATE', taxRate: 0.25 },
      depreciationUSD: new Array(11).fill(0),
    },
    capital: {
      capexUSD: new Array(11).fill(0),
      sustainingCapexUSD: new Array(11).fill(0),
      closureUSD: new Array(11).fill(0),
      workingCapitalDeltaUSD: new Array(11).fill(0),
      terminalProceedsUSD: new Array(11).fill(0),
    },
    operations: null,
    verification: {
      report: null,
      reportedCostCheckpoints: [],
    },
  } as ProjectJsonV3 & Record<string, unknown>;
}
