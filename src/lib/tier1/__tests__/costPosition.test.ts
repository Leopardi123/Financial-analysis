import './costCoProductReconstruction.test.ts';
import assert from 'node:assert/strict';
import {
  assessCostPositionAgainstReference,
  assessSAndPCuRawReferenceCompatibility,
  buildPublicCu2024CostPositionReference,
  buildSAndPCu2024CostPositionReference,
  technicalReportCostEvidenceClass,
  TIER_PUBLIC_CU_COST_POSITION_METRIC,
  type Tier1CostReference,
} from '../costPosition.ts';
import type { Tier1CostNormalized } from '../costNormalization.ts';

function normalized(overrides: Partial<Tier1CostNormalized> = {}): Tier1CostNormalized {
  return {
    status: 'NORMALIZED',
    metric: 'C1_CU_USD_PER_LB',
    reportedLabel: 'C1',
    basis: 'co_product',
    value: 1.20,
    unit: 'USD/lb',
    numeratorUSD: 120,
    denominator: {
      product: 'Cu', basis: 'payable_primary_metal', quantity: 100, unit: 'lb', sourceId: 's', pageOrTable: 'p',
    },
    selectedPeriods: [1],
    terms: [],
    costBaseYear: 2024,
    sourceConflicts: [],
    reportReconciliation: {
      status: 'NOT_PROVIDED', checkpointValue: null, difference: null, toleranceAbs: null, sourceId: null, pageOrTable: null,
    },
    ...overrides,
  };
}

const publicCu2024 = buildPublicCu2024CostPositionReference();
assert.ok(publicCu2024);
if (!publicCu2024) throw new Error('Public Cu 2024 reference missing');
assert.equal(publicCu2024.metric, TIER_PUBLIC_CU_COST_POSITION_METRIC);
assert.equal(publicCu2024.denominatorLabel, 'contained Cu');
assert.ok(Math.abs(publicCu2024.q1Max - 1.6531976163511322) < 1e-12);

const spCu2024 = buildSAndPCu2024CostPositionReference();
assert.ok(spCu2024);
if (!spCu2024) throw new Error('S&P Cu 2024 reference missing');
assert.equal(spCu2024.metric, 'C1_CU_USD_PER_LB');
assert.equal(spCu2024.denominatorLabel, 'paid/payable Cu');
assert.equal(spCu2024.q1Max, 1.40);
assert.equal(spCu2024.p50Max, 1.76);
assert.equal(spCu2024.p75Max, 2.18);
assert.equal(spCu2024.activationAllowed, false);
assert.ok((spCu2024.limitations ?? []).some((x) => x.includes('allocation revenue/price vector')));

assert.equal(technicalReportCostEvidenceClass('vizcachitas-pfs-2023'), 'PFS_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('berg-pfs-2026'), 'PFS_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('warintza-pfs-2025'), 'PFS_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('arctic-fs-2023'), 'FS_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('copper-creek-pea-2023'), 'PEA_ESTIMATE');
assert.equal(technicalReportCostEvidenceClass('unknown-source'), 'UNKNOWN');

const canonicalSAndPShape = assessSAndPCuRawReferenceCompatibility(normalized());
assert.equal(canonicalSAndPShape.status, 'COMPATIBLE_FOR_RAW_REFERENCE');
assert.deepEqual(canonicalSAndPShape.blockers, []);

const bergByProduct = assessSAndPCuRawReferenceCompatibility(normalized({
  metric: 'C1_CU_BY_PRODUCT_USD_PER_LB',
  basis: 'net_by_product',
  value: -0.1585,
  costBaseYear: 2026,
}));
assert.equal(bergByProduct.status, 'NOT_COMPARABLE');
assert.ok(bergByProduct.blockers.some((x) => x.includes('not Cu C1')));
assert.ok(bergByProduct.blockers.some((x) => x.includes('not co_product')));

const bergCuEq = assessSAndPCuRawReferenceCompatibility(normalized({
  metric: 'C1_CUEQ_CO_PRODUCT_USD_PER_LB',
  basis: 'co_product',
  denominator: {
    product: 'CuEq', basis: 'metal_equivalent', quantity: 100, unit: 'lb', sourceId: 's', pageOrTable: 'p',
  },
  value: 1.955,
  costBaseYear: 2026,
}));
assert.equal(bergCuEq.status, 'NOT_COMPARABLE');
assert.ok(bergCuEq.blockers.some((x) => x.includes('denominator product CuEq')));
assert.ok(bergCuEq.blockers.some((x) => x.includes('denominator basis metal_equivalent')));

const warintzaByProduct = assessSAndPCuRawReferenceCompatibility(normalized({
  metric: 'C1_CU_USD_PER_LB',
  basis: 'net_by_product',
  value: 1.0114,
  costBaseYear: null,
}));
assert.equal(warintzaByProduct.status, 'NOT_COMPARABLE');
assert.ok(warintzaByProduct.blockers.some((x) => x.includes('not co_product')));
assert.ok(!warintzaByProduct.blockers.some((x) => x.includes('metric')));

const pfs2026 = assessCostPositionAgainstReference({
  measuredMetric: 'C1_CU_USD_PER_LB',
  value: 1.20,
  unit: 'USD/lb',
  costBaseYear: 2026,
  costEvidenceClass: 'PFS_ESTIMATE',
  semanticCompatibility: canonicalSAndPShape,
  reference: spCu2024,
});
assert.equal(pfs2026.rawReferencePosition, 'BELOW_Q1_REFERENCE');
assert.equal(pfs2026.comparability, 'REFERENCE_ONLY');
assert.equal(pfs2026.measuredCost, 1.20);
assert.equal(pfs2026.adjustedCost, null);
assert.equal(pfs2026.hardTier, null);
assert.ok(pfs2026.reason.includes('cost vintage 2026'));
assert.ok(pfs2026.reason.includes('allocation revenue/price vector'));
assert.ok(pfs2026.reason.includes('ingen syntetisk inflation/FX'));

const byProductPosition = assessCostPositionAgainstReference({
  measuredMetric: 'C1_CU_BY_PRODUCT_USD_PER_LB',
  value: -0.1585,
  unit: 'USD/lb',
  costBaseYear: 2026,
  costEvidenceClass: 'PFS_ESTIMATE',
  semanticCompatibility: bergByProduct,
  reference: spCu2024,
});
assert.equal(byProductPosition.comparability, 'NOT_COMPARABLE');
assert.equal(byProductPosition.rawReferencePosition, 'UNAVAILABLE');
assert.ok(byProductPosition.reason.includes('Semantisk mismatch'));
assert.ok(!byProductPosition.reason.includes('Metric mismatch'));

const publicResearchCompatible = assessCostPositionAgainstReference({
  measuredMetric: TIER_PUBLIC_CU_COST_POSITION_METRIC,
  value: 1.58,
  unit: 'USD/lb',
  costBaseYear: 2026,
  costEvidenceClass: 'PFS_ESTIMATE',
  semanticCompatibility: { status: 'COMPATIBLE_FOR_RAW_REFERENCE', blockers: [] },
  reference: publicCu2024,
});
assert.equal(publicResearchCompatible.rawReferencePosition, 'BELOW_Q1_REFERENCE');
assert.equal(publicResearchCompatible.comparability, 'REFERENCE_ONLY');

const wrongUnit = assessCostPositionAgainstReference({
  measuredMetric: 'C1_CU_USD_PER_LB',
  value: 1.20,
  unit: 'USD/tonne',
  costBaseYear: 2024,
  costEvidenceClass: 'ACTUAL_OPERATION',
  semanticCompatibility: canonicalSAndPShape,
  reference: spCu2024,
});
assert.equal(wrongUnit.comparability, 'NOT_COMPARABLE');
assert.equal(wrongUnit.rawReferencePosition, 'UNAVAILABLE');

const activatedReference: Tier1CostReference = {
  ...spCu2024,
  id: 'TEST_ACTIVATED_REFERENCE',
  sourceRole: 'ACTIVATED_BENCHMARK',
  activationAllowed: true,
  limitations: [],
};
const directActual = assessCostPositionAgainstReference({
  measuredMetric: 'C1_CU_USD_PER_LB',
  value: 1.80,
  unit: 'USD/lb',
  costBaseYear: 2024,
  costEvidenceClass: 'ACTUAL_OPERATION',
  semanticCompatibility: canonicalSAndPShape,
  reference: activatedReference,
});
assert.equal(directActual.comparability, 'DIRECT_REFERENCE');
assert.equal(directActual.rawReferencePosition, 'P50_TO_Q3_REFERENCE');
assert.equal(directActual.hardTier, null);

console.log('costPosition.test.ts passed');
