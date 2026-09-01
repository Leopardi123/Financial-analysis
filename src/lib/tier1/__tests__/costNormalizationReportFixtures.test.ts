import assert from 'node:assert/strict';
import { VIZCACHITAS_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/vizcachitasPfs.ts';
import { BERG_CAD_TO_USD } from '../../project/jsonv3/__tests__/fixtures/bergPfs.ts';
import { normalizeTier1ProjectCost, type Tier1CostNormalizationTerm } from '../costNormalization.ts';

const M = 1_000_000;

function onePeriodTerm(args: {
  id: string;
  role: string;
  operation: 'ADD' | 'SUBTRACT';
  valueUSD: number;
  sourceId: string;
  pageOrTable: string;
}): Tier1CostNormalizationTerm {
  const { valueUSD, ...term } = args;
  return { ...term, seriesUSD: [valueUSD] };
}

const viz = VIZCACHITAS_PFS_V3;
assert.equal(viz.economics.costModel.mode, 'COMPONENTS');
if (viz.economics.costModel.mode !== 'COMPONENTS') throw new Error('Vizcachitas cost components required.');
const vizMining = viz.economics.costModel.components.find((component) => component.id === 'mining_opex');
const vizProcessing = viz.economics.costModel.components.find((component) => component.id === 'processing_opex');
const vizProducedCu = viz.metals.metalInProductQtyByMetal?.Cu;
if (!vizMining || !vizProcessing || !vizProducedCu) throw new Error('Vizcachitas source rows required.');
const vizTerms: Tier1CostNormalizationTerm[] = [
  { id: 'mining_opex', role: 'mining', operation: 'ADD', seriesUSD: vizMining.seriesUSD, sourceId: vizMining.sourceId ?? '', pageOrTable: vizMining.pageOrTable ?? '' },
  { id: 'processing_opex', role: 'processing', operation: 'ADD', seriesUSD: vizProcessing.seriesUSD, sourceId: vizProcessing.sourceId ?? '', pageOrTable: vizProcessing.pageOrTable ?? '' },
];
const vizFirst8 = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'C1 Cost', basis: 'reported_other', terms: vizTerms,
  denominator: {
    product: 'Cu', basis: 'produced_primary_metal', series: vizProducedCu, unit: 'tonne', normalizedUnit: 'lb',
    sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.7, pp.359-362',
  },
  scope: { kind: 'FIRST_N_POSITIVE_DENOMINATOR_PERIODS', count: 8, fromPeriod: viz.time.productionStartPeriod },
  costBaseYear: 2023,
  reportCheckpoint: { value: 0.93, toleranceAbs: 0.01, sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 21.11, pp.349-350' },
});
assert.equal(vizFirst8.status, 'NORMALIZED');
assert.ok(vizFirst8.status === 'NORMALIZED' && Math.abs(vizFirst8.value - 0.9205063747772041) < 1e-9);
const vizLom = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'C1 Cost', basis: 'reported_other', terms: vizTerms,
  denominator: {
    product: 'Cu', basis: 'produced_primary_metal', series: vizProducedCu, unit: 'tonne', normalizedUnit: 'lb',
    sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 22.7, pp.359-362',
  },
  scope: { kind: 'POSITIVE_DENOMINATOR_PERIODS', fromPeriod: viz.time.productionStartPeriod },
  costBaseYear: 2023,
  reportCheckpoint: { value: 1.25, toleranceAbs: 0.01, sourceId: 'vizcachitas-pfs-2023', pageOrTable: 'Table 21.11, pp.349-350' },
});
assert.equal(vizLom.status, 'NORMALIZED');
assert.ok(vizLom.status === 'NORMALIZED' && Math.abs(vizLom.value - 1.2411286741265457) < 1e-9);

const bergSource = { sourceId: 'berg-pfs-2026', pageOrTable: 'Table 22-3, pp.321-322' };
const bergPoolUSD = (18_130.5 + 3_434.5 + 502.7) * M * BERG_CAD_TO_USD;
const bergSecondaryGrossRevenueUSD = (16_334.3 + 4_917.7 + 1_899.2) * M * BERG_CAD_TO_USD;
const bergByProduct = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'C1 cost – by-product basis', basis: 'net_by_product',
  terms: [
    onePeriodTerm({ id: 'c1_pool', role: 'onsite_offsite_royalty', operation: 'ADD', valueUSD: bergPoolUSD, ...bergSource }),
    onePeriodTerm({ id: 'secondary_revenue', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: bergSecondaryGrossRevenueUSD, ...bergSource }),
  ],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [4_695 * M], unit: 'lb', normalizedUnit: 'lb', ...bergSource },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2026,
  reportCheckpoint: { value: -0.17, toleranceAbs: 0.005, ...bergSource },
});
assert.equal(bergByProduct.status, 'NORMALIZED');
assert.ok(bergByProduct.status === 'NORMALIZED' && Math.abs(bergByProduct.value - (-0.1684675186368477)) < 1e-12);
const bergCuEq = normalizeTier1ProjectCost({
  metric: 'C1_CUEQ_CO_PRODUCT_USD_PER_LB', reportedLabel: 'C1 cost – co-product basis', basis: 'co_product',
  terms: [onePeriodTerm({ id: 'c1_pool', role: 'onsite_offsite_royalty', operation: 'ADD', valueUSD: bergPoolUSD, ...bergSource })],
  denominator: { product: 'CuEq', basis: 'metal_equivalent', series: [8_253 * M], unit: 'lb', normalizedUnit: 'lb', ...bergSource },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2026,
  reportCheckpoint: { value: 1.95, toleranceAbs: 0.005, ...bergSource },
});
assert.equal(bergCuEq.status, 'NORMALIZED');
assert.ok(bergCuEq.status === 'NORMALIZED' && Math.abs(bergCuEq.value - 1.9519472918938567) < 1e-12);

const warintzaSource = { sourceId: 'warintza-pfs-2025', pageOrTable: 'Table 22.4 p.345; Table 22.6' };
const warintzaDenominator = [3_306_000];
const warintzaTerms: Tier1CostNormalizationTerm[] = [
  onePeriodTerm({ id: 'mining', role: 'mining', operation: 'ADD', valueUSD: 3_116 * M, ...warintzaSource }),
  onePeriodTerm({ id: 'processing', role: 'processing', operation: 'ADD', valueUSD: 7_250 * M, ...warintzaSource }),
  onePeriodTerm({ id: 'ga', role: 'site_ga', operation: 'ADD', valueUSD: 1_010 * M, ...warintzaSource }),
  onePeriodTerm({ id: 'deductions', role: 'tcrc_deductions', operation: 'ADD', valueUSD: 3_204 * M, ...warintzaSource }),
  onePeriodTerm({ id: 'royalties', role: 'royalty', operation: 'ADD', valueUSD: 2_529 * M, ...warintzaSource }),
  onePeriodTerm({ id: 'stream_purchase_revenue', role: 'stream_purchase_revenue', operation: 'SUBTRACT', valueUSD: 131 * M, ...warintzaSource }),
  onePeriodTerm({ id: 'au_credit', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: 2_140 * M, ...warintzaSource }),
  onePeriodTerm({ id: 'ag_credit', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: 677 * M, ...warintzaSource }),
  onePeriodTerm({ id: 'mo_credit', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: 6_792 * M, ...warintzaSource }),
];
const warintzaC1 = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'C1 Cash cost', basis: 'net_by_product', terms: warintzaTerms,
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: warintzaDenominator, unit: 'tonne', normalizedUnit: 'lb', ...warintzaSource },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
  reportCheckpoint: { value: 1.01, toleranceAbs: 0.005, ...warintzaSource },
});
assert.equal(warintzaC1.status, 'NORMALIZED');
assert.ok(warintzaC1.status === 'NORMALIZED' && Math.abs(warintzaC1.value - 1.0110472397247428) < 1e-12);
const warintzaAisc = normalizeTier1ProjectCost({
  metric: 'AISC_CU_BY_PRODUCT_USD_PER_LB', reportedLabel: 'C1 + sustaining', basis: 'net_by_product',
  terms: [...warintzaTerms, onePeriodTerm({ id: 'sustaining', role: 'sustaining_capex', operation: 'ADD', valueUSD: 1_713 * M, ...warintzaSource })],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: warintzaDenominator, unit: 'tonne', normalizedUnit: 'lb', ...warintzaSource },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
  reportCheckpoint: { value: 1.25, toleranceAbs: 0.005, ...warintzaSource },
});
assert.equal(warintzaAisc.status, 'NORMALIZED');
assert.ok(warintzaAisc.status === 'NORMALIZED' && Math.abs(warintzaAisc.value - 1.2460755911494252) < 1e-12);

const arcticSource = { sourceId: 'arctic-fs-2023', pageOrTable: 'Table 22-2 pp.390-391' };
const arcticBaseTerms: Tier1CostNormalizationTerm[] = [
  onePeriodTerm({ id: 'onsite', role: 'onsite_cost', operation: 'ADD', valueUSD: 2_793.6 * M, ...arcticSource }),
  onePeriodTerm({ id: 'offsite', role: 'offsite_cost', operation: 'ADD', valueUSD: 2_969.1 * M, ...arcticSource }),
  onePeriodTerm({ id: 'pb_credit', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: 334.8 * M, ...arcticSource }),
  onePeriodTerm({ id: 'zn_credit', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: 2_580.3 * M, ...arcticSource }),
  onePeriodTerm({ id: 'au_credit', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: 697.8 * M, ...arcticSource }),
  onePeriodTerm({ id: 'ag_credit', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: 757.0 * M, ...arcticSource }),
];
const arcticCash = normalizeTier1ProjectCost({
  metric: 'CASH_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB', reportedLabel: 'Cash Costs, Net of By-product Credits', basis: 'net_by_product', terms: arcticBaseTerms,
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [1_932_882_000], unit: 'lb', normalizedUnit: 'lb', ...arcticSource },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
  reportCheckpoint: { value: 0.72, toleranceAbs: 0.005, ...arcticSource },
});
assert.equal(arcticCash.status, 'NORMALIZED');
assert.ok(arcticCash.status === 'NORMALIZED' && Math.abs(arcticCash.value - 0.7205820117317038) < 1e-12);
const arcticAllIn = normalizeTier1ProjectCost({
  metric: 'ALL_IN_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB', reportedLabel: 'All-in Cost, Net of By-product Credits', basis: 'net_by_product',
  terms: [...arcticBaseTerms, onePeriodTerm({ id: 'total_capital', role: 'report_total_capital', operation: 'ADD', valueUSD: 1_719.6 * M, ...arcticSource })],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [1_932_882_000], unit: 'lb', normalizedUnit: 'lb', ...arcticSource },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
  reportCheckpoint: { value: 1.61, toleranceAbs: 0.005, ...arcticSource },
});
assert.equal(arcticAllIn.status, 'NORMALIZED');
assert.ok(arcticAllIn.status === 'NORMALIZED' && Math.abs(arcticAllIn.value - 1.6102379762447987) < 1e-12);

const ccSource = { sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-3 pp.353-354' };
const ccCashTerms: Tier1CostNormalizationTerm[] = [
  onePeriodTerm({ id: 'operating', role: 'operating', operation: 'ADD', valueUSD: 5_130.2 * M, ...ccSource }),
  onePeriodTerm({ id: 'offsite', role: 'offsite', operation: 'ADD', valueUSD: 916.1 * M, ...ccSource }),
  onePeriodTerm({ id: 'ag_credit', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: 194 * M, ...ccSource }),
  onePeriodTerm({ id: 'mo_credit', role: 'by_product_credit', operation: 'SUBTRACT', valueUSD: 586 * M, ...ccSource }),
];
const ccConflict = [{
  code: 'ROYALTY_CASH_COST_BOUNDARY',
  description: 'Table 22-1 footnote says royalties are in cash cost; Table 22-3 arithmetic places royalties outside the 1.67 cash-cost numerator.',
  sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-1 pp.348-349; Table 22-3 pp.353-354',
}];
const ccCash = normalizeTier1ProjectCost({
  metric: 'CASH_COST_BY_PRODUCT_CU_USD_PER_LB', reportedLabel: 'Cash Cost (By-Product Basis)', basis: 'net_by_product', terms: ccCashTerms,
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [3_162 * M], unit: 'lb', normalizedUnit: 'lb', ...ccSource },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2023, sourceConflicts: ccConflict,
  reportCheckpoint: { value: 1.67, toleranceAbs: 0.005, sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-1 pp.348-349; Table 22-3 p.354' },
});
assert.equal(ccCash.status, 'NORMALIZED');
assert.ok(ccCash.status === 'NORMALIZED' && Math.abs(ccCash.value - 1.6654965211891208) < 1e-12);
assert.equal(ccCash.status === 'NORMALIZED' ? ccCash.sourceConflicts.length : 0, 1);
const ccAisc = normalizeTier1ProjectCost({
  metric: 'AISC_CU_BY_PRODUCT_USD_PER_LB', reportedLabel: 'All-in Sustaining Cost (AISC)', basis: 'net_by_product',
  terms: [
    ...ccCashTerms,
    onePeriodTerm({ id: 'royalties', role: 'royalty', operation: 'ADD', valueUSD: 337.8 * M, ...ccSource }),
    onePeriodTerm({ id: 'sustaining', role: 'sustaining_capex', operation: 'ADD', valueUSD: 68.8 * M, ...ccSource }),
    onePeriodTerm({ id: 'closure', role: 'closure', operation: 'ADD', valueUSD: 169.8 * M, ...ccSource }),
  ],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [3_162 * M], unit: 'lb', normalizedUnit: 'lb', ...ccSource },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2023,
  reportCheckpoint: { value: 1.85, toleranceAbs: 0.005, sourceId: 'copper-creek-pea-2023', pageOrTable: 'Table 22-1 pp.348-349; Table 22-3 p.354' },
});
assert.equal(ccAisc.status, 'NORMALIZED');
assert.ok(ccAisc.status === 'NORMALIZED' && Math.abs(ccAisc.value - 1.8477862112586974) < 1e-12);

console.log('costNormalizationReportFixtures.test.ts passed');
