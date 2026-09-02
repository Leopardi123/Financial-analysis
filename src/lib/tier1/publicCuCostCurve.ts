export const PUBLIC_CU_COST_LB_PER_TONNE = 2204.6226218487757;

export type PublicCuPilotMetal = 'Cu' | 'Au' | 'Ag' | 'Mo';
export type PublicCuPilotQuantityUnit = 'tonne' | 'toz';
export type PublicCuPilotObservationStatus = 'ELIGIBLE_FOR_PILOT' | 'PARTIAL' | 'REJECTED';
export type PublicCuPilotDenominatorBasis = 'CONTAINED_CU_PRODUCED' | 'PAYABLE_CU_PRODUCED' | 'CONTAINED_CU_SOLD';

export type PublicCuPilotQuantity = {
  value: number;
  unit: PublicCuPilotQuantityUnit;
};

export type PublicCuPilotCommonPoolEvidence =
  | { kind: 'TOTAL_USD'; valueUSD: number }
  | { kind: 'USD_PER_LB_CONTAINED_CU'; valueUSDPerLb: number };

export type PublicCuPilotObservation = {
  id: string;
  operator: string;
  mine: string;
  dataYear: number;
  status: PublicCuPilotObservationStatus;
  denominatorBasis: PublicCuPilotDenominatorBasis;
  sourceUrl: string;
  sourcePageOrTable: string;
  commonPoolEvidence?: PublicCuPilotCommonPoolEvidence;
  productionByMetal?: Partial<Record<PublicCuPilotMetal, PublicCuPilotQuantity>>;
  sourceObservedMetric?: {
    label: string;
    valueUSDPerLb: number;
    denominatorBasis: PublicCuPilotDenominatorBasis;
  };
  blockers?: string[];
};

export const TIER_PUBLIC_CU_COST_PILOT_POLICY = {
  status: 'RESEARCH_ONLY' as const,
  comparisonEnabled: false,
  dataYear: 2024,
  metric: 'TIER_PUBLIC_CO_PRODUCT_CASH_COST_CU_USD_PER_LB_CONTAINED' as const,
  denominatorBasis: 'CONTAINED_CU_PRODUCED' as const,
  denominatorUnit: 'lb' as const,
  commonCashPool: {
    include: ['mining', 'processing_or_milling', 'site_ga_or_indirect', 'treatment_refining', 'freight_transport_marketing', 'direct_smelter_or_realisation_costs'],
    exclude: ['by_product_credits', 'royalties', 'production_taxes', 'sustaining_capex', 'deferred_stripping_capex', 'corporate_ga', 'depreciation_amortization', 'exploration', 'financing', 'hedges', 'non_routine'],
  },
  allocation: 'GROSS_CONTAINED_METAL_PRODUCTION_VALUE_PRO_RATA' as const,
  streamTreatment: 'IGNORED_BY_DEFINITION_FOR_REFERENCE_VALUE_ALLOCATION' as const,
  streamTreatmentNote: 'The pilot allocates pre-by-product operating cash cost by physical 2024 contained-metal production at one fixed reference deck. Streams, hedges and offtakes do not change the allocation weights; they are financing/commercial encumbrances rather than physical production.',
  quartileMethod: 'PRODUCTION_WEIGHTED_NEAREST_CUMULATIVE_THRESHOLD' as const,
  minimumEligibleObservationsForQuartiles: 20,
  referencePriceDeck: {
    dataYear: 2024,
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1164771/000165495426003025/ndm_ex993.htm',
    sourcePageOrTable: 'Northern Dynasty Minerals 2025 MD&A p.23, Market Trends table reporting 2024 annual averages and source footnotes',
    byMetal: {
      Cu: { value: 4.16, unit: 'USD_PER_LB' as const, underlying: 'LME Official Cash Price via Argus Media/metalprices.com' },
      Au: { value: 2_386, unit: 'USD_PER_TOZ' as const, underlying: 'LBMA PM price via Argus Media/metalprices.com' },
      Ag: { value: 28.27, unit: 'USD_PER_TOZ' as const, underlying: 'London PM fix via Argus Media/metalprices.com' },
      Mo: { value: 21.30, unit: 'USD_PER_LB' as const, underlying: 'Platts' },
    },
  },
} as const;

export const PUBLIC_CU_COST_PILOT_OBSERVATIONS: PublicCuPilotObservation[] = [
  {
    id: 'kamoa-kakula-2024',
    operator: 'Ivanhoe Mines / Zijin Mining JV',
    mine: 'Kamoa-Kakula',
    dataYear: 2024,
    status: 'ELIGIBLE_FOR_PILOT',
    denominatorBasis: 'CONTAINED_CU_PRODUCED',
    sourceUrl: 'https://www.ivanhoemines.com/news-stories/news-release/ivanhoe-mines-issues-2024-fourth-quarter-and-annual-financial-results-overview-of-construction-and-exploration-activities/',
    sourcePageOrTable: 'FY 2024 Kamoa-Kakula production table and cost-of-sales-to-C1 reconciliation',
    commonPoolEvidence: { kind: 'TOTAL_USD', valueUSD: 1_544_039_000 },
    productionByMetal: { Cu: { value: 437_061, unit: 'tonne' } },
  },
  {
    id: 'hudbay-peru-2024',
    operator: 'Hudbay Minerals',
    mine: 'Constancia / Peru business unit',
    dataYear: 2024,
    status: 'ELIGIBLE_FOR_PILOT',
    denominatorBasis: 'CONTAINED_CU_PRODUCED',
    sourceUrl: 'https://hudbayminerals.com/investors/press-releases/press-release-details/2025/Hudbay-Delivers-Strong-Fourth-Quarter-and-Record-Full-Year-2024-Results-Achieves-2024-Consolidated-Production-and-Cost-Guidance-and-Provides-2025-Annual-Guidance/default.aspx',
    sourcePageOrTable: '2024 Peru production table and cash cost per pound of copper produced reconciliation',
    commonPoolEvidence: { kind: 'TOTAL_USD', valueUSD: 554_000_000 },
    productionByMetal: {
      Cu: { value: 99_001, unit: 'tonne' },
      Au: { value: 98_226, unit: 'toz' },
      Ag: { value: 2_708_262, unit: 'toz' },
      Mo: { value: 1_323, unit: 'tonne' },
    },
  },
  {
    id: 'copper-mountain-2024',
    operator: 'Hudbay Minerals',
    mine: 'Copper Mountain',
    dataYear: 2024,
    status: 'ELIGIBLE_FOR_PILOT',
    denominatorBasis: 'CONTAINED_CU_PRODUCED',
    sourceUrl: 'https://hudbayminerals.com/investors/press-releases/press-release-details/2025/Hudbay-Delivers-Strong-Fourth-Quarter-and-Record-Full-Year-2024-Results-Achieves-2024-Consolidated-Production-and-Cost-Guidance-and-Provides-2025-Annual-Guidance/default.aspx',
    sourcePageOrTable: '2024 British Columbia production table and cash cost per pound of copper produced reconciliation',
    commonPoolEvidence: { kind: 'TOTAL_USD', valueUSD: 216_100_000 },
    productionByMetal: {
      Cu: { value: 26_406, unit: 'tonne' },
      Au: { value: 19_789, unit: 'toz' },
      Ag: { value: 280_499, unit: 'toz' },
    },
  },
  {
    id: 'kansanshi-2024',
    operator: 'First Quantum Minerals',
    mine: 'Kansanshi',
    dataYear: 2024,
    status: 'ELIGIBLE_FOR_PILOT',
    denominatorBasis: 'CONTAINED_CU_PRODUCED',
    sourceUrl: 'https://www.first-quantum.com/wp-content/uploads/2025/04/Q4-2024-FQM-Management-s-Discussion-Analysis-FINAL.pdf',
    sourcePageOrTable: 'Q4 2024 MD&A pp.20-21 production; p.68 Unit Cash Costs',
    commonPoolEvidence: { kind: 'USD_PER_LB_CONTAINED_CU', valueUSDPerLb: 2.24 },
    productionByMetal: {
      Cu: { value: 170_929, unit: 'tonne' },
      Au: { value: 105_103, unit: 'toz' },
    },
    sourceObservedMetric: { label: 'Copper cash cost (C1)', valueUSDPerLb: 1.52, denominatorBasis: 'CONTAINED_CU_PRODUCED' },
  },
  {
    id: 'sentinel-2024',
    operator: 'First Quantum Minerals',
    mine: 'Sentinel',
    dataYear: 2024,
    status: 'ELIGIBLE_FOR_PILOT',
    denominatorBasis: 'CONTAINED_CU_PRODUCED',
    sourceUrl: 'https://www.first-quantum.com/wp-content/uploads/2025/04/Q4-2024-FQM-Management-s-Discussion-Analysis-FINAL.pdf',
    sourcePageOrTable: 'Q4 2024 MD&A production review and p.68 Unit Cash Costs',
    commonPoolEvidence: { kind: 'USD_PER_LB_CONTAINED_CU', valueUSDPerLb: 1.94 },
    productionByMetal: { Cu: { value: 231_000, unit: 'tonne' } },
    sourceObservedMetric: { label: 'Copper cash cost (C1)', valueUSDPerLb: 1.94, denominatorBasis: 'CONTAINED_CU_PRODUCED' },
  },
  {
    id: 'caraiba-2024',
    operator: 'Ero Copper',
    mine: 'Caraíba Operations',
    dataYear: 2024,
    status: 'PARTIAL',
    denominatorBasis: 'CONTAINED_CU_PRODUCED',
    sourceUrl: 'https://erocopper.com/site/assets/files/6620/2024_ero_copper_annual_report.pdf',
    sourcePageOrTable: '2024 Annual Report MD&A pp.27-28 / report pp.41-42',
    sourceObservedMetric: { label: 'Copper C1 cash cost', valueUSDPerLb: 1.97, denominatorBasis: 'CONTAINED_CU_PRODUCED' },
    blockers: ['COPPER_SEGMENT_BY_PRODUCT_PHYSICAL_QUANTITIES_NOT_SOURCE_LOCKED_FOR_COMMON_REFERENCE_VALUE_ALLOCATION'],
  },
  {
    id: 'candelaria-2024',
    operator: 'Lundin Mining',
    mine: 'Candelaria',
    dataYear: 2024,
    status: 'PARTIAL',
    denominatorBasis: 'CONTAINED_CU_SOLD',
    sourceUrl: 'https://www.lundinmining.com/investors/lundin-mining-announces-2025-production-results-and-2026-guidance',
    sourcePageOrTable: 'Cash Cost — Year Ended December 31, 2024 retrospective table',
    sourceObservedMetric: { label: 'Cash cost', valueUSDPerLb: 1.73, denominatorBasis: 'CONTAINED_CU_SOLD' },
    blockers: ['SOURCE_COST_DENOMINATOR_IS_CONTAINED_CU_SOLD_NOT_CONTAINED_CU_PRODUCED'],
  },
  {
    id: 'caserones-2024',
    operator: 'Lundin Mining',
    mine: 'Caserones',
    dataYear: 2024,
    status: 'PARTIAL',
    denominatorBasis: 'CONTAINED_CU_SOLD',
    sourceUrl: 'https://www.lundinmining.com/investors/lundin-mining-announces-2025-production-results-and-2026-guidance',
    sourcePageOrTable: 'Cash Cost — Year Ended December 31, 2024 retrospective table',
    sourceObservedMetric: { label: 'Cash cost', valueUSDPerLb: 2.51, denominatorBasis: 'CONTAINED_CU_SOLD' },
    blockers: ['SOURCE_COST_DENOMINATOR_IS_CONTAINED_CU_SOLD_NOT_CONTAINED_CU_PRODUCED'],
  },
  {
    id: 'chapada-2024',
    operator: 'Lundin Mining',
    mine: 'Chapada',
    dataYear: 2024,
    status: 'PARTIAL',
    denominatorBasis: 'CONTAINED_CU_SOLD',
    sourceUrl: 'https://www.lundinmining.com/investors/lundin-mining-announces-2025-production-results-and-2026-guidance',
    sourcePageOrTable: 'Cash Cost — Year Ended December 31, 2024 retrospective table',
    sourceObservedMetric: { label: 'Cash cost', valueUSDPerLb: 1.58, denominatorBasis: 'CONTAINED_CU_SOLD' },
    blockers: ['SOURCE_COST_DENOMINATOR_IS_CONTAINED_CU_SOLD_NOT_CONTAINED_CU_PRODUCED'],
  },
  {
    id: 'centinela-2024',
    operator: 'Antofagasta plc',
    mine: 'Centinela',
    dataYear: 2024,
    status: 'PARTIAL',
    denominatorBasis: 'PAYABLE_CU_PRODUCED',
    sourceUrl: 'https://www.antofagasta.co.uk/media/4767/antofagasta-annual-report-2024-web-version-25-march-2-compressed.pdf',
    sourcePageOrTable: '2024 Annual Report p.32 Centinela operating review; cash-cost definition in Alternative Performance Measures',
    sourceObservedMetric: { label: 'Cash costs before by-products', valueUSDPerLb: 2.60, denominatorBasis: 'PAYABLE_CU_PRODUCED' },
    blockers: ['EXACT_PAYABLE_CU_QUANTITY_NOT_SOURCE_LOCKED_TO_REBASE_NUMERATOR_TO_CONTAINED_CU_PRODUCED'],
  },
];

export type PublicCuPilotNormalizedObservation = {
  status: 'NORMALIZED';
  id: string;
  mine: string;
  commonPoolUSD: number;
  preAllocationCashCostUSDPerLbContainedCu: number;
  copperReferenceValueShare: number;
  normalizedCuCostUSDPerLbContainedCu: number;
  copperContainedTonnes: number;
  referenceValueUSDByMetal: Partial<Record<PublicCuPilotMetal, number>>;
};

export type PublicCuPilotNormalizationFailure = {
  status: 'NOT_VERIFIED';
  id: string;
  mine: string;
  blockers: string[];
};

export type PublicCuPilotNormalizationResult = PublicCuPilotNormalizedObservation | PublicCuPilotNormalizationFailure;

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function quantityReferenceValueUSD(metal: PublicCuPilotMetal, quantity: PublicCuPilotQuantity): number | null {
  const deck = TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.byMetal[metal];
  if (!deck) return null;
  if (metal === 'Cu' || metal === 'Mo') {
    if (quantity.unit !== 'tonne') return null;
    if (deck.unit !== 'USD_PER_LB') return null;
    return quantity.value * PUBLIC_CU_COST_LB_PER_TONNE * deck.value;
  }
  if (quantity.unit !== 'toz') return null;
  if (deck.unit !== 'USD_PER_TOZ') return null;
  return quantity.value * deck.value;
}

export function normalizePublicCuCostObservation(observation: PublicCuPilotObservation): PublicCuPilotNormalizationResult {
  const blockers: string[] = [];
  if (observation.status !== 'ELIGIBLE_FOR_PILOT') blockers.push(...(observation.blockers ?? [`PILOT_STATUS_${observation.status}`]));
  if (observation.dataYear !== TIER_PUBLIC_CU_COST_PILOT_POLICY.dataYear) blockers.push(`DATA_YEAR_${observation.dataYear}_DOES_NOT_MATCH_2024`);
  if (observation.denominatorBasis !== TIER_PUBLIC_CU_COST_PILOT_POLICY.denominatorBasis) blockers.push(`DENOMINATOR_${observation.denominatorBasis}_DOES_NOT_MATCH_CONTAINED_CU_PRODUCED`);
  if (!observation.sourceUrl.trim() || !observation.sourcePageOrTable.trim()) blockers.push('MISSING_SOURCE_PROVENANCE');
  if (!observation.commonPoolEvidence) blockers.push('MISSING_SOURCE_LOCKED_COMMON_CASH_POOL');
  if (!observation.productionByMetal) blockers.push('MISSING_SOURCE_LOCKED_PHYSICAL_PRODUCTION_VECTOR');
  if (blockers.length > 0) return { status: 'NOT_VERIFIED', id: observation.id, mine: observation.mine, blockers };

  const production = observation.productionByMetal as Partial<Record<PublicCuPilotMetal, PublicCuPilotQuantity>>;
  const cu = production.Cu;
  if (!cu || cu.unit !== 'tonne' || !finitePositive(cu.value)) {
    return { status: 'NOT_VERIFIED', id: observation.id, mine: observation.mine, blockers: ['INVALID_OR_MISSING_CONTAINED_CU_PRODUCTION_TONNES'] };
  }

  const referenceValueUSDByMetal: Partial<Record<PublicCuPilotMetal, number>> = {};
  let totalReferenceValueUSD = 0;
  for (const [rawMetal, quantity] of Object.entries(production)) {
    if (!quantity) continue;
    const metal = rawMetal as PublicCuPilotMetal;
    if (!(metal in TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.byMetal)) {
      return { status: 'NOT_VERIFIED', id: observation.id, mine: observation.mine, blockers: [`UNSUPPORTED_REFERENCE_PRICE_PRODUCT_${rawMetal}`] };
    }
    if (!finitePositive(quantity.value)) {
      return { status: 'NOT_VERIFIED', id: observation.id, mine: observation.mine, blockers: [`INVALID_PRODUCTION_QUANTITY_${rawMetal}`] };
    }
    const valueUSD = quantityReferenceValueUSD(metal, quantity);
    if (!finitePositive(valueUSD)) {
      return { status: 'NOT_VERIFIED', id: observation.id, mine: observation.mine, blockers: [`UNIT_OR_PRICE_MISMATCH_${rawMetal}`] };
    }
    referenceValueUSDByMetal[metal] = valueUSD;
    totalReferenceValueUSD += valueUSD;
  }

  const cuReferenceValueUSD = referenceValueUSDByMetal.Cu;
  if (!finitePositive(cuReferenceValueUSD) || !finitePositive(totalReferenceValueUSD)) {
    return { status: 'NOT_VERIFIED', id: observation.id, mine: observation.mine, blockers: ['INVALID_REFERENCE_VALUE_VECTOR'] };
  }

  const copperContainedLb = cu.value * PUBLIC_CU_COST_LB_PER_TONNE;
  const pool = observation.commonPoolEvidence as PublicCuPilotCommonPoolEvidence;
  const commonPoolUSD = pool.kind === 'TOTAL_USD'
    ? pool.valueUSD
    : pool.valueUSDPerLb * copperContainedLb;
  if (!finitePositive(commonPoolUSD)) {
    return { status: 'NOT_VERIFIED', id: observation.id, mine: observation.mine, blockers: ['INVALID_COMMON_CASH_POOL'] };
  }

  const copperReferenceValueShare = cuReferenceValueUSD / totalReferenceValueUSD;
  const preAllocationCashCostUSDPerLbContainedCu = commonPoolUSD / copperContainedLb;
  const normalizedCuCostUSDPerLbContainedCu = preAllocationCashCostUSDPerLbContainedCu * copperReferenceValueShare;

  return {
    status: 'NORMALIZED',
    id: observation.id,
    mine: observation.mine,
    commonPoolUSD,
    preAllocationCashCostUSDPerLbContainedCu,
    copperReferenceValueShare,
    normalizedCuCostUSDPerLbContainedCu,
    copperContainedTonnes: cu.value,
    referenceValueUSDByMetal,
  };
}

function productionWeightedThreshold(rows: PublicCuPilotNormalizedObservation[], quantile: number): number {
  const sorted = [...rows].sort((a, b) => a.normalizedCuCostUSDPerLbContainedCu - b.normalizedCuCostUSDPerLbContainedCu);
  const totalTonnes = sorted.reduce((sum, row) => sum + row.copperContainedTonnes, 0);
  const threshold = totalTonnes * quantile;
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.copperContainedTonnes;
    if (cumulative >= threshold) return row.normalizedCuCostUSDPerLbContainedCu;
  }
  return sorted[sorted.length - 1]?.normalizedCuCostUSDPerLbContainedCu ?? Number.NaN;
}

export function buildPublicCuPilotCurve(observations: PublicCuPilotObservation[] = PUBLIC_CU_COST_PILOT_OBSERVATIONS) {
  const results = observations.map(normalizePublicCuCostObservation);
  const normalized = results.filter((row): row is PublicCuPilotNormalizedObservation => row.status === 'NORMALIZED');
  const totalContainedCuTonnes = normalized.reduce((sum, row) => sum + row.copperContainedTonnes, 0);
  if (normalized.length < TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles) {
    return {
      status: 'NOT_READY' as const,
      comparisonEnabled: false,
      normalized,
      failures: results.filter((row): row is PublicCuPilotNormalizationFailure => row.status === 'NOT_VERIFIED'),
      eligibleObservationCount: normalized.length,
      minimumRequired: TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles,
      totalContainedCuTonnes,
      q1Max: null,
      p50Max: null,
      p75Max: null,
    };
  }
  return {
    status: 'RESEARCH_CURVE_READY' as const,
    comparisonEnabled: false,
    normalized,
    failures: results.filter((row): row is PublicCuPilotNormalizationFailure => row.status === 'NOT_VERIFIED'),
    eligibleObservationCount: normalized.length,
    minimumRequired: TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles,
    totalContainedCuTonnes,
    q1Max: productionWeightedThreshold(normalized, 0.25),
    p50Max: productionWeightedThreshold(normalized, 0.50),
    p75Max: productionWeightedThreshold(normalized, 0.75),
  };
}
