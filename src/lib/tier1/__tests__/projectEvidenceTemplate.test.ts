import assert from 'node:assert/strict';
import { buildProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import type { ProjectJsonV1 } from '../../project/jsonv1/schema.ts';

const masterN = 2;
const source = {
  version: 'project_json_v2',
  time: { masterN, productionStartPeriod: 1, productionStartYear: 2031 },
  economics: { taxRate: 0.25 },
  series: {
    capexUSD: [100, 0, 0],
    operatingCostsUSD: [0, 10, 10],
    sustainingCapexUSD: [0, 1, 1],
    siteGandA_USD: [0, 1, 1],
    reclamationUSD: [0, 0, 2],
    byproductCreditsUSD: [0, 0, 0],
  },
  metals: {
    payableQtyByMetal: { Cu: [0, 100, 100] },
    payableQtyUnitByMetal: { Cu: 'lb' },
    priceKeyByMetal: { Cu: 'CU_USD_LB' },
    auPriceKey: null,
  },
  operations: {
    capacity: { throughputUnit: 'tpa', nameplateThroughput: 1_000_000 },
    oreMinedTonnes: [0, 1000, 1000],
    oreMilledTonnes: [0, 1000, 1000],
  },
  economicsBreakdown: {
    meta: { defaultSource: 'PFS', notes: 'locked' },
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB',
      value: 1.22,
      unit: 'USD/lb',
      // Legacy Tier-only evidence is deliberately ignored by the template.
      basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
      costBaseYear: 2025,
      sourceId: 'pfs-2025',
      pageOrTable: 'Table 18-5',
    }],
  },
  reconciliation: {
    report: { sourceId: 'legacy' },
  },
} as unknown as ProjectJsonV1;

const template = buildProjectJsonV1Template(source) as any;
assert.equal(template.economicsBreakdown.reportedCostMetrics.length, 1);
assert.equal(template.economicsBreakdown.reportedCostMetrics[0].metric, 'C1_CU_USD_PER_LB');
assert.equal(template.economicsBreakdown.reportedCostMetrics[0].value, 1.22);
assert.equal(template.economicsBreakdown.reportedCostMetrics[0].unit, 'USD/lb');
assert.equal('basisId' in template.economicsBreakdown.reportedCostMetrics[0], false);
assert.equal('costBaseYear' in template.economicsBreakdown.reportedCostMetrics[0], false);
assert.equal('sourceId' in template.economicsBreakdown.reportedCostMetrics[0], false);
assert.equal('pageOrTable' in template.economicsBreakdown.reportedCostMetrics[0], false);
assert.equal('costBaseYear' in template.economicsBreakdown.meta, false);
assert.equal('reconciliation' in template, false);

console.log('projectEvidenceTemplate.test.ts passed');
