import assert from 'node:assert/strict';
import {
  assessNormalizedCuC1BenchmarkReadiness,
  normalizeTier1ProjectCost,
} from '../costNormalization.ts';
import {
  S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  type Tier1CuC1DefinitionContract,
} from '../costDefinitionContract.ts';

const provenance = { sourceId: 'test-report', pageOrTable: 'Table X' };

const base = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB',
  reportedLabel: 'Cash cost',
  basis: 'net_by_product',
  terms: [
    { id: 'site', role: 'site_cost', operation: 'ADD', seriesUSD: [100, 200, 0], ...provenance },
    { id: 'offsite', role: 'offsite_cost', operation: 'ADD', seriesUSD: [20, 40, 0], ...provenance },
    { id: 'credit', role: 'by_product_credit', operation: 'SUBTRACT', seriesUSD: [30, 60, 0], ...provenance },
  ],
  denominator: {
    product: 'Cu', basis: 'payable_primary_metal', series: [50, 100, 0], unit: 'lb', normalizedUnit: 'lb', ...provenance,
  },
  scope: { kind: 'POSITIVE_DENOMINATOR_PERIODS' },
  costBaseYear: 2024,
  reportCheckpoint: { value: 1.8, toleranceAbs: 1e-12, ...provenance },
});
assert.equal(base.status, 'NORMALIZED');
if (base.status === 'NORMALIZED') {
  assert.equal(base.numeratorUSD, 270);
  assert.equal(base.denominator.quantity, 150);
  assert.equal(base.value, 1.8);
  assert.equal(base.reportReconciliation.status, 'MATCHED');
  assert.deepEqual(base.selectedPeriods, [0, 1]);
}

const negativeByProduct = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'By-product C1', basis: 'net_by_product',
  terms: [
    { id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [100], ...provenance },
    { id: 'credit', role: 'credit', operation: 'SUBTRACT', seriesUSD: [120], ...provenance },
  ],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [10], unit: 'lb', normalizedUnit: 'lb', ...provenance },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2024,
});
assert.equal(negativeByProduct.status, 'NORMALIZED');
assert.ok(negativeByProduct.status === 'NORMALIZED' && negativeByProduct.value === -2, 'Negative by-product C1 is valid and must not be clamped.');

const produced = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'Produced-Cu C1', basis: 'reported_other',
  terms: [{ id: 'pool', role: 'site_cost', operation: 'ADD', seriesUSD: [220.46226218487757], ...provenance }],
  denominator: { product: 'Cu', basis: 'produced_primary_metal', series: [100], unit: 'kg', normalizedUnit: 'lb', ...provenance },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2023,
});
const payable = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'Payable-Cu diagnostic', basis: 'reported_other',
  terms: [{ id: 'pool', role: 'site_cost', operation: 'ADD', seriesUSD: [220.46226218487757], ...provenance }],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [90], unit: 'kg', normalizedUnit: 'lb', ...provenance },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2023,
});
assert.equal(produced.status, 'NORMALIZED');
assert.equal(payable.status, 'NORMALIZED');
if (produced.status === 'NORMALIZED' && payable.status === 'NORMALIZED') {
  assert.ok(Math.abs(produced.value - 1) < 1e-12);
  assert.ok(payable.value > produced.value, 'Produced and payable denominators must remain distinct.');
}

const withClosure = normalizeTier1ProjectCost({
  metric: 'ALL_IN_COST', reportedLabel: 'All-in', basis: 'net_by_product',
  terms: [
    { id: 'operating', role: 'operating', operation: 'ADD', seriesUSD: [100, 100, 0], ...provenance },
    { id: 'closure', role: 'closure', operation: 'ADD', seriesUSD: [0, 0, 100], ...provenance },
  ],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [100, 100, 0], unit: 'lb', normalizedUnit: 'lb', ...provenance },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2024,
});
assert.equal(withClosure.status, 'NORMALIZED');
assert.ok(withClosure.status === 'NORMALIZED' && withClosure.value === 1.5, 'ALL_PERIODS must retain terminal cost even when terminal denominator is zero.');

const firstTwo = normalizeTier1ProjectCost({
  metric: 'C1', reportedLabel: 'First two', basis: 'reported_other',
  terms: [{ id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [999, 10, 20, 30], ...provenance }],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [0, 10, 10, 10], unit: 'lb', normalizedUnit: 'lb', ...provenance },
  scope: { kind: 'FIRST_N_POSITIVE_DENOMINATOR_PERIODS', count: 2 }, costBaseYear: null,
});
assert.equal(firstTwo.status, 'NORMALIZED');
assert.ok(firstTwo.status === 'NORMALIZED' && firstTwo.value === 1.5);
assert.deepEqual(firstTwo.status === 'NORMALIZED' ? firstTwo.selectedPeriods : [], [1, 2]);

const failures = [
  normalizeTier1ProjectCost({
    metric: 'C1', reportedLabel: 'Bad provenance', basis: 'reported_other',
    terms: [{ id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [1], sourceId: '', pageOrTable: 'p1' }],
    denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [1], unit: 'lb', normalizedUnit: 'lb', ...provenance },
    scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
  }),
  normalizeTier1ProjectCost({
    metric: 'C1', reportedLabel: 'Negative source', basis: 'reported_other',
    terms: [{ id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [-1], ...provenance }],
    denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [1], unit: 'lb', normalizedUnit: 'lb', ...provenance },
    scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
  }),
  normalizeTier1ProjectCost({
    metric: 'C1', reportedLabel: 'Length mismatch', basis: 'reported_other',
    terms: [{ id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [1, 2], ...provenance }],
    denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [1], unit: 'lb', normalizedUnit: 'lb', ...provenance },
    scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
  }),
  normalizeTier1ProjectCost({
    metric: 'C1', reportedLabel: 'Duplicate id', basis: 'reported_other',
    terms: [
      { id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [1], ...provenance },
      { id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [1], ...provenance },
    ],
    denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [1], unit: 'lb', normalizedUnit: 'lb', ...provenance },
    scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
  }),
  normalizeTier1ProjectCost({
    metric: 'C1', reportedLabel: 'Zero denominator', basis: 'reported_other',
    terms: [{ id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [1], ...provenance }],
    denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [0], unit: 'lb', normalizedUnit: 'lb', ...provenance },
    scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
  }),
  normalizeTier1ProjectCost({
    metric: 'C1', reportedLabel: 'Checkpoint mismatch', basis: 'reported_other',
    terms: [{ id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [2], ...provenance }],
    denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [1], unit: 'lb', normalizedUnit: 'lb', ...provenance },
    scope: { kind: 'ALL_PERIODS' }, costBaseYear: null,
    reportCheckpoint: { value: 1, toleranceAbs: 0.01, ...provenance },
  }),
];
for (const failed of failures) assert.equal(failed.status, 'NOT_VERIFIED');

const conflict = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'Conflicted report metric', basis: 'co_product',
  terms: [{ id: 'cost', role: 'cost', operation: 'ADD', seriesUSD: [100], ...provenance }],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [100], unit: 'lb', normalizedUnit: 'lb', ...provenance },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2024,
  sourceConflicts: [{ code: 'ROYALTY_BOUNDARY', description: 'Two report tables disagree on royalty inclusion.' }],
});
assert.equal(conflict.status, 'NORMALIZED');
assert.equal(conflict.status === 'NORMALIZED' ? conflict.sourceConflicts.length : 0, 1);
assert.ok(assessNormalizedCuC1BenchmarkReadiness({ normalized: conflict, hasStreams: false }).blockers.includes('unresolved source conflicts'));

const fullyVerifiedContract: Tier1CuC1DefinitionContract = {
  ...S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  allocation: {
    ...S_AND_P_CO_PRODUCT_C1_CU_DEFINITION.allocation,
    revenueVectorStatus: 'VERIFIED',
    streamTreatmentStatus: 'VERIFIED',
  },
  componentBoundaryStatus: 'VERIFIED',
  costVintageAlignmentStatus: 'VERIFIED',
};
const compatible = normalizeTier1ProjectCost({
  metric: 'C1_CU_USD_PER_LB', reportedLabel: 'Verified co-product C1', basis: 'co_product',
  terms: [{ id: 'allocated_cost', role: 'co_product_allocated_cost', operation: 'ADD', seriesUSD: [125], ...provenance }],
  denominator: { product: 'Cu', basis: 'payable_primary_metal', series: [100], unit: 'lb', normalizedUnit: 'lb', ...provenance },
  scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2024,
});
assert.deepEqual(
  assessNormalizedCuC1BenchmarkReadiness({ normalized: compatible, contract: fullyVerifiedContract, hasStreams: false }),
  { status: 'VERIFIED', blockers: [] },
);
assert.equal(assessNormalizedCuC1BenchmarkReadiness({ normalized: compatible, hasStreams: false }).status, 'NOT_VERIFIED', 'Current S&P definition blockers must keep runtime fail-closed.');

console.log('costNormalization.test.ts passed');
