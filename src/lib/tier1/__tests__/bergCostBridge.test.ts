import assert from 'node:assert/strict';
import { BERG_CAD_TO_USD, BERG_PFS_V3 } from '../../project/jsonv3/__tests__/fixtures/bergPfs.ts';
import { allocateTier1CoProductCost } from '../costAllocation.ts';
import { S_AND_P_CO_PRODUCT_C1_CU_DEFINITION, assessCuC1DefinitionReadiness } from '../costDefinitionContract.ts';

const M = 1_000_000;
const raw = BERG_PFS_V3;
const length = raw.time.masterN + 1;

assert.equal(raw.streamsByMetal, null, 'Berg has no stream contract, so generic stream-treatment uncertainty is not project-applicable.');
assert.equal(raw.economics.costModel.mode, 'AGGREGATE');
assert.equal(raw.economics.sellingModel.mode, 'AGGREGATE');
if (raw.economics.costModel.mode !== 'AGGREGATE' || raw.economics.sellingModel.mode !== 'AGGREGATE') {
  throw new Error('Berg aggregate cost and selling series are required.');
}

function operatingCadM(values: number[]): number[] {
  assert.equal(values.length, 28, 'Berg Table 22-4 operating vectors must contain Years 1-28.');
  return [0, 0, 0, ...values.map((value) => value * M * BERG_CAD_TO_USD), 0];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const royaltyCadM = [
  22.3, 27.0, 18.9, 22.6, 30.4, 24.8, 19.0, 17.9, 13.9, 16.7, 10.1, 18.2, 17.2, 11.9,
  17.9, 22.0, 20.1, 17.7, 16.7, 13.6, 18.7, 19.8, 15.3, 17.0, 13.5, 12.8, 15.9, 10.8,
];
const royaltyUSD = operatingCadM(royaltyCadM);

// Table 22-4 exposes published annual product-level net revenue rows. This is
// materially stronger project evidence than Vizcachitas, where the comparable
// selling/payability line is aggregated across products.
const netRevenueCadMByProduct = {
  Cu: [1363.6, 1751.5, 1221.0, 1501.9, 1887.5, 1320.1, 974.0, 1091.6, 801.1, 908.7, 659.6, 928.4, 985.7, 758.4, 1116.7, 1262.8, 1071.2, 940.1, 875.9, 741.5, 951.1, 927.3, 753.9, 813.1, 676.1, 606.8, 735.8, 401.6],
  Mo: [572.7, 581.6, 384.8, 433.7, 759.9, 837.2, 661.1, 457.8, 405.8, 523.3, 162.4, 592.3, 505.7, 249.3, 423.9, 658.4, 696.2, 618.4, 590.4, 426.9, 645.1, 762.9, 575.8, 711.7, 499.7, 491.4, 677.0, 568.3],
  Ag: [213.5, 270.2, 198.3, 219.8, 268.8, 230.1, 189.6, 156.3, 125.6, 176.2, 112.6, 231.1, 168.6, 110.7, 167.7, 191.8, 176.3, 158.9, 148.9, 136.5, 221.0, 234.9, 153.6, 130.7, 126.9, 129.0, 132.5, 88.3],
  Au: [80.8, 98.3, 86.6, 108.1, 119.9, 93.1, 75.8, 79.8, 59.2, 63.8, 72.1, 63.3, 64.5, 72.6, 83.0, 82.8, 66.5, 56.7, 52.3, 52.5, 57.5, 55.7, 48.8, 44.4, 48.9, 47.8, 41.6, 20.4],
} as const;
const netRevenueUSDByProduct = Object.fromEntries(
  Object.entries(netRevenueCadMByProduct).map(([product, values]) => [product, operatingCadM([...values])]),
) as Record<string, number[]>;

const operatingCostsUSD = raw.economics.costModel.operatingCostsUSD;
const sellingCostsUSD = raw.economics.sellingModel.sellingCostsUSD;
assert.equal(operatingCostsUSD.length, length);
assert.equal(sellingCostsUSD.length, length);
assert.equal(royaltyUSD.length, length);

const reportC1PoolUSD = Array.from({ length }, (_, t) => {
  const operating = operatingCostsUSD[t];
  const selling = sellingCostsUSD[t];
  assert.equal(typeof operating, 'number', `Berg operatingCostsUSD[${t}] must be numeric.`);
  assert.equal(typeof selling, 'number', `Berg sellingCostsUSD[${t}] must be numeric.`);
  return (operating as number) + (selling as number) + royaltyUSD[t];
});

// Table 22-3 totals and footnotes reconstruct both published C1 conventions.
const reportTotalOnsiteCadM = 18_130.5;
const reportTotalOffsiteCadM = 3_434.5;
const reportTotalRoyaltyCadM = 502.7;
const reportTotalC1PoolUSD = (reportTotalOnsiteCadM + reportTotalOffsiteCadM + reportTotalRoyaltyCadM) * M * BERG_CAD_TO_USD;
const reportPayableCuMlb = 4_695;
const reportPayableCuEqMlb = 8_253;
const reportGrossRevenueCadM = { Cu: 30_548.8, Mo: 16_334.3, Ag: 4_917.7, Au: 1_899.2 };
const reportNetRevenueCadM = { Cu: 28_026.9, Mo: 15_473.4, Ag: 4_868.6, Au: 1_896.7 };

const reportByProductC1 = (
  reportTotalC1PoolUSD
  - (reportGrossRevenueCadM.Mo + reportGrossRevenueCadM.Ag + reportGrossRevenueCadM.Au) * M * BERG_CAD_TO_USD
) / (reportPayableCuMlb * M);
assert.ok(Math.abs(reportByProductC1 - (-0.1684675186368477)) < 1e-12);
assert.ok(Math.abs(reportByProductC1 - (-0.17)) < 0.005, 'Berg Table 22-3 by-product C1 must reconstruct to the reported -0.17 USD/lb Cu.');

const reportCuEqC1 = reportTotalC1PoolUSD / (reportPayableCuEqMlb * M);
assert.ok(Math.abs(reportCuEqC1 - 1.9519472918938567) < 1e-12);
assert.ok(Math.abs(reportCuEqC1 - 1.95) < 0.005, 'Berg Table 22-3 co-product CuEq C1 must reconstruct to the reported 1.95 USD/lb CuEq.');

// The report CuEq formula is mathematically equivalent to allocating the same
// C1 pool by gross payable metal value and then dividing Cu's allocated share
// by payable Cu. That is not the SNL/S&P net-revenue method.
const grossRevenueTotalCadM = Object.values(reportGrossRevenueCadM).reduce((total, value) => total + value, 0);
const grossCuShare = reportGrossRevenueCadM.Cu / grossRevenueTotalCadM;
const grossRevenueAllocatedCuC1 = reportTotalC1PoolUSD * grossCuShare / (reportPayableCuMlb * M);
assert.ok(Math.abs(grossRevenueAllocatedCuC1 - 1.951929844320298) < 1e-12);
assert.ok(Math.abs(grossRevenueAllocatedCuC1 - reportCuEqC1) < 0.0001, 'Berg CuEq C1 should match gross-revenue pro-rata Cu allocation to rounding precision.');

// Table 22-4 also publishes product-level NET revenue at the PFS report deck.
// The allocator can therefore execute a source-locked report-deck diagnostic
// without guessing a per-product selling-cost split. This does NOT close the
// benchmark allocation-price/revenue-basis question for the 2024 S&P curve.
const allocation = allocateTier1CoProductCost({
  components: [{
    id: 'berg-report-c1-pool',
    category: 'other_site_opex',
    seriesUSD: reportC1PoolUSD,
    allocation: { mode: 'MIXED_REVENUE_WEIGHTED' },
  }],
  allocationRevenueUSDByProduct: netRevenueUSDByProduct,
  toleranceAbsUSD: 0.01,
});
assert.equal(allocation.status, 'COMPUTABLE');

const roundedAnnualPayableCuLb = sum(raw.metals.payableQtyByMetal.Cu.map((value) => typeof value === 'number' ? value : 0));
const periodAllocatedCuCostUSD = sum(allocation.allocatedCostUSDByProduct.Cu);
const annualNetRevenueDiagnosticC1 = periodAllocatedCuCostUSD / roundedAnnualPayableCuLb;
assert.ok(Math.abs(annualNetRevenueDiagnosticC1 - 1.9233627515309155) < 1e-12);
assert.ok(Math.abs(sum(allocation.sourceCostUSD) - sum(allocation.allocatedCostUSD)) < 0.01, 'Berg net-revenue allocation must conserve the selected report C1 pool.');

const reportNetRevenueTotalCadM = Object.values(reportNetRevenueCadM).reduce((total, value) => total + value, 0);
const aggregateNetCuShare = reportNetRevenueCadM.Cu / reportNetRevenueTotalCadM;
const aggregateNetRevenueDiagnosticC1 = reportTotalC1PoolUSD * aggregateNetCuShare / (reportPayableCuMlb * M);
assert.ok(Math.abs(aggregateNetRevenueDiagnosticC1 - 1.9131478227692833) < 1e-12);
assert.ok(grossRevenueAllocatedCuC1 - aggregateNetRevenueDiagnosticC1 > 0.03, 'Gross-equivalent and net-revenue allocation must not be treated as interchangeable.');

// Year 1 is an additional denominator identity check: the published by-product
// C1 row (-0.34) is reproduced on the payable-Cu quantity shown in Table 22-4.
const year1CostPoolUSD = (615.8 + 156.8 + 22.3) * M * BERG_CAD_TO_USD;
const year1SecondaryGrossRevenueUSD = (604.6 + 215.7 + 80.9) * M * BERG_CAD_TO_USD;
const year1ByProductC1 = (year1CostPoolUSD - year1SecondaryGrossRevenueUSD) / (228 * M);
assert.ok(Math.abs(year1ByProductC1 - (-0.34034649122807037)) < 1e-12);
assert.ok(Math.abs(year1ByProductC1 - (-0.34)) < 0.005);
const year1CuEqC1 = year1CostPoolUSD / (367 * M);
assert.ok(Math.abs(year1CuEqC1 - 1.5811362397820161) < 1e-12);
assert.ok(Math.abs(year1CuEqC1 - 1.58) < 0.005);

const readiness = assessCuC1DefinitionReadiness(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION, { hasStreams: false });
assert.deepEqual(readiness, {
  status: 'NOT_VERIFIED',
  blockers: [
    'exact allocation revenue/price vector',
    'full current C1 component boundary',
    'project-to-benchmark cost-vintage alignment',
  ],
});

console.log('bergCostBridge.test.ts passed');
