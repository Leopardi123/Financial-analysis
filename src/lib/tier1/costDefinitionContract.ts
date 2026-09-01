export type Tier1DefinitionStatus = 'VERIFIED' | 'NOT_VERIFIED';

export type Tier1CuC1DefinitionContract = {
  basisId: 'S_AND_P_CO_PRODUCT_C1_CU';
  metric: 'C1_CU_USD_PER_LB';
  benchmarkDataYear: number;
  denominator: {
    product: 'Cu';
    basis: 'PAID_OR_PAYABLE';
    unit: 'lb';
    status: 'VERIFIED';
  };
  allocation: {
    method: 'NET_REVENUE_PRO_RATA';
    methodStatus: 'VERIFIED';
    revenueVectorStatus: Tier1DefinitionStatus;
    streamTreatmentStatus: Tier1DefinitionStatus;
  };
  componentBoundaryStatus: Tier1DefinitionStatus;
  costVintageAlignmentStatus: Tier1DefinitionStatus;
  evidence: {
    currentCurve: string;
    coProductMethod: string;
    santaCruzDefinitionControl: string;
  };
};

/**
 * Definition contract for the exact S&P co-product Cu C1 benchmark used by Tier.
 *
 * VERIFIED fields are source-locked in docs/tier1-cu-c1-methodology-evidence.md.
 * Unknown fields intentionally remain NOT_VERIFIED so a mathematically
 * computable co-product allocation cannot silently become a percentile claim.
 */
export const S_AND_P_CO_PRODUCT_C1_CU_DEFINITION: Tier1CuC1DefinitionContract = {
  basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
  metric: 'C1_CU_USD_PER_LB',
  benchmarkDataYear: 2024,
  denominator: {
    product: 'Cu',
    basis: 'PAID_OR_PAYABLE',
    unit: 'lb',
    status: 'VERIFIED',
  },
  allocation: {
    method: 'NET_REVENUE_PRO_RATA',
    methodStatus: 'VERIFIED',
    revenueVectorStatus: 'NOT_VERIFIED',
    streamTreatmentStatus: 'NOT_VERIFIED',
  },
  componentBoundaryStatus: 'NOT_VERIFIED',
  costVintageAlignmentStatus: 'NOT_VERIFIED',
  evidence: {
    currentCurve: 'S&P Global Market Intelligence 2025 / Q4 2024 dataset: co-product C1, Paid Copper axis.',
    coProductMethod: 'SNL Mine Economics public methodology: co-product/pro-rata costs shared on a net-revenue basis; current S&P copper-cobalt research confirms revenue-share sensitivity.',
    santaCruzDefinitionControl: 'Santa Cruz 2025 PFS C1 1.32 USD/lb equals mining + processing + G&A and is explicitly compared with the S&P curve.',
  },
};

export type Tier1DefinitionReadiness = {
  status: 'VERIFIED' | 'NOT_VERIFIED';
  blockers: string[];
};

export type Tier1CuC1DefinitionReadinessContext = {
  /**
   * False means the specific project has no stream/encumbrance affecting metal
   * revenue, so an unresolved generic stream methodology cannot block that
   * project. Omitted/true preserves the conservative global readiness guard.
   */
  hasStreams?: boolean;
  /**
   * True means the project source itself exposes the exact product-level net
   * revenue vector needed by the allocator. This is project evidence only; it
   * does not change the global S&P contract or authorize a guessed vector for
   * another project.
   */
  hasExactAllocationRevenueVector?: boolean;
};

/**
 * Gate external benchmark readiness only. This does not assess the project cost
 * value itself and does not modify canonical Project economics.
 */
export function assessCuC1DefinitionReadiness(
  contract: Tier1CuC1DefinitionContract = S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  context: Tier1CuC1DefinitionReadinessContext = {},
): Tier1DefinitionReadiness {
  const blockers: string[] = [];
  if (contract.denominator.status !== 'VERIFIED') blockers.push('paid/payable Cu denominator');
  if (contract.allocation.methodStatus !== 'VERIFIED') blockers.push('co-product allocation method');
  if (contract.allocation.revenueVectorStatus !== 'VERIFIED' && context.hasExactAllocationRevenueVector !== true) {
    blockers.push('exact allocation revenue/price vector');
  }
  if (contract.allocation.streamTreatmentStatus !== 'VERIFIED' && context.hasStreams !== false) blockers.push('stream treatment');
  if (contract.componentBoundaryStatus !== 'VERIFIED') blockers.push('full current C1 component boundary');
  if (contract.costVintageAlignmentStatus !== 'VERIFIED') blockers.push('project-to-benchmark cost-vintage alignment');
  return blockers.length === 0
    ? { status: 'VERIFIED', blockers: [] }
    : { status: 'NOT_VERIFIED', blockers };
}
