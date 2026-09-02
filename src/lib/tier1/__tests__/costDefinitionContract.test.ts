import assert from 'node:assert/strict';
import {
  S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  assessCuC1DefinitionReadiness,
  type Tier1CuC1DefinitionContract,
} from '../costDefinitionContract.ts';

assert.equal(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION.metric, 'C1_CU_USD_PER_LB');
assert.equal(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION.benchmarkDataYear, 2024);
assert.deepEqual(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION.denominator, {
  product: 'Cu', basis: 'PAID_OR_PAYABLE', unit: 'lb', status: 'VERIFIED',
});
assert.equal(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION.allocation.method, 'NET_REVENUE_PRO_RATA');
assert.equal(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION.allocation.methodStatus, 'VERIFIED');

const current = assessCuC1DefinitionReadiness();
assert.equal(current.status, 'NOT_VERIFIED');
assert.deepEqual(current.blockers, [
  'exact allocation revenue/price vector',
  'stream treatment',
  'full current C1 component boundary',
  'project-to-benchmark cost-vintage alignment',
]);

const noStreamProject = assessCuC1DefinitionReadiness(S_AND_P_CO_PRODUCT_C1_CU_DEFINITION, { hasStreams: false });
assert.equal(noStreamProject.status, 'NOT_VERIFIED');
assert.deepEqual(noStreamProject.blockers, [
  'exact allocation revenue/price vector',
  'full current C1 component boundary',
  'project-to-benchmark cost-vintage alignment',
]);

const fullyVerified: Tier1CuC1DefinitionContract = {
  ...S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  allocation: {
    ...S_AND_P_CO_PRODUCT_C1_CU_DEFINITION.allocation,
    revenueVectorStatus: 'VERIFIED',
    streamTreatmentStatus: 'VERIFIED',
  },
  componentBoundaryStatus: 'VERIFIED',
  costVintageAlignmentStatus: 'VERIFIED',
};
assert.deepEqual(assessCuC1DefinitionReadiness(fullyVerified), { status: 'VERIFIED', blockers: [] });

console.log('costDefinitionContract.test.ts passed');
