import './publicCuCostCurve.test.ts';
import assert from 'node:assert/strict';
import {
  assessNormalizedCuC1BenchmarkReadiness,
  normalizeTier1ProjectCost,
} from '../costNormalization.ts';
import {
  S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  type Tier1CuC1DefinitionContract,
} from '../costDefinitionContract.ts';

const source = { sourceId: 'cost-vintage-policy-test', pageOrTable: 'Methodology control' };

const fullyVerifiedExceptProjectVintage: Tier1CuC1DefinitionContract = {
  ...S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  allocation: {
    ...S_AND_P_CO_PRODUCT_C1_CU_DEFINITION.allocation,
    revenueVectorStatus: 'VERIFIED',
    streamTreatmentStatus: 'VERIFIED',
  },
  componentBoundaryStatus: 'VERIFIED',
  costVintageAlignmentStatus: 'VERIFIED',
};

function normalizedForYear(costBaseYear: number) {
  return normalizeTier1ProjectCost({
    metric: 'C1_CU_USD_PER_LB',
    reportedLabel: 'Synthetic verified co-product C1',
    basis: 'co_product',
    terms: [{
      id: 'allocated_cost', role: 'co_product_allocated_cost', operation: 'ADD', seriesUSD: [125], ...source,
    }],
    denominator: {
      product: 'Cu', basis: 'payable_primary_metal', series: [100], unit: 'lb', normalizedUnit: 'lb', ...source,
    },
    scope: { kind: 'ALL_PERIODS' },
    costBaseYear,
  });
}

const sameYear = normalizedForYear(2024);
assert.deepEqual(
  assessNormalizedCuC1BenchmarkReadiness({
    normalized: sameYear,
    contract: fullyVerifiedExceptProjectVintage,
    hasStreams: false,
  }),
  { status: 'VERIFIED', blockers: [] },
  'Exact benchmark-year cost may pass the vintage gate when every other contract field is independently verified.',
);

const priorYear = normalizedForYear(2023);
const priorYearReadiness = assessNormalizedCuC1BenchmarkReadiness({
  normalized: priorYear,
  contract: fullyVerifiedExceptProjectVintage,
  hasStreams: false,
});
assert.equal(priorYearReadiness.status, 'NOT_VERIFIED');
assert.ok(priorYearReadiness.blockers.includes('cost vintage 2023 is not benchmark year 2024'));

// Do not invent CPI, FX or generic inflation restatement. Until S&P's own
// restatement methodology is source-locked, exact benchmark-year equality is
// the only permitted route through the project-vintage gate.
const futureYear = normalizedForYear(2025);
const futureYearReadiness = assessNormalizedCuC1BenchmarkReadiness({
  normalized: futureYear,
  contract: fullyVerifiedExceptProjectVintage,
  hasStreams: false,
});
assert.equal(futureYearReadiness.status, 'NOT_VERIFIED');
assert.ok(futureYearReadiness.blockers.includes('cost vintage 2025 is not benchmark year 2024'));

console.log('costVintagePolicy.test.ts passed');
