import assert from 'node:assert/strict';
import { buildProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import type { ProjectJsonV1 } from '../../project/jsonv1/schema.ts';

const masterN = 2;
const source: ProjectJsonV1 = {
  version: 'project_json_v2',
  time: { masterN, productionStartPeriod: 1, productionStartYear: 2027 },
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
    meta: { defaultSource: 'PFS', costBaseYear: 2025, notes: 'locked' },
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB',
      basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
      value: 1.22,
      unit: 'USD/lb',
      costBaseYear: 2025,
      sourceId: 'pfs-2025',
      pageOrTable: 'Table 18-5',
    }],
  },
  reconciliation: {
    report: {
      sourceId: 'pfs-2025',
      pageOrTable: 'Economic analysis table',
      discountRate: 0.08,
      npv: 100,
      npvCurrency: 'USD',
      irrAfterTax: 0.25,
      priceDeckByMetal: { Cu: { value: 4, unit: 'USD/lb' } },
    },
    jsonCheck: { npvAtReportDiscountRate: 100.5, irrAfterTax: 0.249 },
    checks: {
      periodMappingVerified: true,
      capexPlacementVerified: true,
      closureWorkingCapitalVerified: true,
      reportPricesAndAssumptionsVerified: true,
      cashFlowDefinitionVerified: true,
    },
    toleranceRelative: 0.02,
    verifiedAtUtc: '2026-08-28T00:00:00Z',
  },
};

const template = buildProjectJsonV1Template(source) as any;
assert.equal(template.economicsBreakdown.meta.costBaseYear, 2025);
assert.equal(template.economicsBreakdown.reportedCostMetrics.length, 1);
assert.equal(template.economicsBreakdown.reportedCostMetrics[0].metric, 'C1_CU_USD_PER_LB');
assert.equal(template.economicsBreakdown.reportedCostMetrics[0].basisId, 'S_AND_P_CO_PRODUCT_C1_CU');
assert.equal(template.economicsBreakdown.reportedCostMetrics[0].sourceId, 'pfs-2025');
assert.equal(template.reconciliation.report.pageOrTable, 'Economic analysis table');
assert.equal(template.reconciliation.checks.periodMappingVerified, true);

console.log('projectEvidenceTemplate.test.ts passed');
