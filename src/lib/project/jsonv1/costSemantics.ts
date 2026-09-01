export type ProjectReportedCostBasis = 'net_by_product' | 'co_product' | 'before_by_product' | 'reported_other' | 'unknown';
export type ProjectReportedCostDenominator = 'payable_primary_metal' | 'produced_primary_metal' | 'metal_equivalent' | 'sold_metal' | 'other' | 'unknown';
export type ProjectReportedCostByProductTreatment = 'credited' | 'co_product_allocation' | 'excluded' | 'not_applicable' | 'unknown';
export type ProjectReportedCostComponentTreatment = 'included' | 'excluded' | 'partial' | 'not_applicable' | 'unknown';
export type ProjectReportedCostCoProductMethod = 'metal_equivalent_denominator' | 'revenue_allocation' | 'physical_allocation' | 'reported_other' | 'unknown';
export type ProjectReportedCostQuality = 'reported_exact' | 'reported_basis_incomplete';
export type ProjectReportedCostPeriod =
  | { kind: 'LOM' }
  | { kind: 'FIRST_N_OPERATING_YEARS'; years: number }
  | { kind: 'STEADY_STATE' }
  | { kind: 'OTHER'; label: string }
  | { kind: 'UNKNOWN' };
