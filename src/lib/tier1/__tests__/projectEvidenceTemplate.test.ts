import assert from 'node:assert/strict';
import { buildProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import type { ProjectJsonV1 } from '../../project/jsonv1/schema.ts';

const masterN = 2;
const source = {
  version: 'project_json_v2',
  time: { masterN, productionStartPeriod: 1, productionStartYear: 2031 },
  economics: { taxRate: 0.25 },
  series: {
    capexUSD: [100, 0, 0], operatingCostsUSD: [0, 10, 10], sustainingCapexUSD: [0, 1, 1],
    siteGandA_USD: [0, 1, 1], reclamationUSD: [0, 0, 2], byproductCreditsUSD: [0, 0, 0],
  },
  metals: {
    payableQtyByMetal: { Cu: [0, 100, 100] }, payableQtyUnitByMetal: { Cu: 'lb' },
    priceKeyByMetal: { Cu: 'CU_USD_LB' }, auPriceKey: null,
  },
  operations: { capacity: { throughputUnit: 'tpa', nameplateThroughput: 1_000_000 }, oreMinedTonnes: [0, 1000, 1000], oreMilledTonnes: [0, 1000, 1000] },
  economicsBreakdown: {
    meta: { defaultSource: 'PFS', notes: 'locked' },
    reportedCostMetrics: [{
      metric: 'C1_CU_USD_PER_LB', reportedLabel: 'C1 cost – co-product basis', value: 1.95, unit: 'USD/lb',
      definitionNotes: 'Exact report wording.', primaryMetal: 'Cu', basis: 'co_product', denominator: 'metal_equivalent',
      period: { kind: 'LOM' }, byProductTreatment: 'co_product_allocation', royaltyTreatment: 'included', offSiteTreatment: 'included',
      coProductMethod: 'metal_equivalent_denominator', equivalentFormula: 'Cu + Mo*price ratio',
      quality: 'reported_exact', costBaseYear: 2026,
      // Legacy benchmark-specific proof remains deliberately outside the typed project schema.
      basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
      sourceId: 'pfs-2026', pageOrTable: 'Table 22-3',
    }],
  },
  reconciliation: { report: { sourceId: 'legacy' } },
} as unknown as ProjectJsonV1;

const template = buildProjectJsonV1Template(source) as any;
const row = template.economicsBreakdown.reportedCostMetrics[0];
assert.equal(template.economicsBreakdown.reportedCostMetrics.length, 1);
assert.equal(row.metric, 'C1_CU_USD_PER_LB');
assert.equal(row.reportedLabel, 'C1 cost – co-product basis');
assert.equal(row.value, 1.95);
assert.equal(row.unit, 'USD/lb');
assert.equal(row.definitionNotes, 'Exact report wording.');
assert.equal(row.primaryMetal, 'Cu');
assert.equal(row.basis, 'co_product');
assert.equal(row.denominator, 'metal_equivalent');
assert.deepEqual(row.period, { kind: 'LOM' });
assert.equal(row.byProductTreatment, 'co_product_allocation');
assert.equal(row.royaltyTreatment, 'included');
assert.equal(row.offSiteTreatment, 'included');
assert.equal(row.coProductMethod, 'metal_equivalent_denominator');
assert.equal(row.equivalentFormula, 'Cu + Mo*price ratio');
assert.equal(row.quality, 'reported_exact');
assert.equal(row.costBaseYear, 2026);
assert.equal(row.sourceId, 'pfs-2026');
assert.equal(row.pageOrTable, 'Table 22-3');
assert.equal('basisId' in row, false);
assert.equal('reconciliation' in template, false);
assert.match(template.economicsBreakdown._description_reportedCostMetrics, /Single source of truth/);

console.log('projectEvidenceTemplate.test.ts passed');
