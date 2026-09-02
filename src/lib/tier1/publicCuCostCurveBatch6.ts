import {
  PUBLIC_CU_COST_LB_PER_TONNE,
  TIER_PUBLIC_CU_COST_PILOT_POLICY,
  type PublicCuPilotNormalizedObservation,
} from './publicCuCostCurve.ts';
import {
  TIER_PUBLIC_CU_COST_BATCH5_POLICY,
  buildBatch5PublicCuPilotCurve,
} from './publicCuCostCurveBatch5.ts';

export type PublicCuBatch6Metal = 'Cu' | 'Au' | 'Ag' | 'Mo' | 'Zn' | 'Pb';
export type PublicCuBatch6Quantity = { value: number; unit: 'tonne' | 'toz' };
export type PublicCuBatch6Observation = {
  id: string;
  operator: string;
  mine: string;
  country: string;
  dataYear: number;
  reportingPeriod: 'FULL_CALENDAR_YEAR' | 'PARTIAL_YEAR';
  operationBasis: 'FULL_OPERATION' | 'ATTRIBUTABLE';
  status: 'ELIGIBLE_FOR_PILOT' | 'PARTIAL';
  sourceUrl: string;
  sourcePageOrTable: string;
  supportingSources?: Array<{ sourceUrl: string; sourcePageOrTable: string }>;
  commonPoolUSD?: number;
  productionByMetal?: Partial<Record<PublicCuBatch6Metal, PublicCuBatch6Quantity>>;
  blockers?: string[];
};

export const TIER_PUBLIC_CU_COST_BATCH6_POLICY = {
  ...TIER_PUBLIC_CU_COST_PILOT_POLICY,
  reportingPeriod: 'FULL_CALENDAR_YEAR' as const,
  operationBasis: 'FULL_OPERATION' as const,
  supplementalPriceDeck: TIER_PUBLIC_CU_COST_BATCH5_POLICY.supplementalPriceDeck,
} as const;

export const PUBLIC_CU_COST_BATCH6_OBSERVATIONS: PublicCuBatch6Observation[] = [
  {
    id: 'mount-milligan-2024',
    operator: 'Centerra Gold',
    mine: 'Mount Milligan',
    country: 'Canada',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'FULL_OPERATION',
    status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://s205.q4cdn.com/276554285/files/doc_downloads/2025/10/MTM_Technical_Report_October_2025.pdf',
    sourcePageOrTable: '2025 Technical Report Table 1-1, Historical Production to December 31, 2024: 2024 Cu 57.6 Mlb and Au 171.9 koz; note states figures are shown on a 100% production basis',
    supportingSources: [{
      sourceUrl: 'https://www.centerragold.com/investor-news/news-details/2025/Centerra-Gold-Reports-Fourth-Quarter-and-Full-Year-2024-Results-and-2025-Outlook-Strong-Cash-Flow-from-Operating-Activities-and-625-Million-in-Cash-and-Cash-Equivalents-02-20-2025/default.aspx',
      sourcePageOrTable: 'FY2024 Mount Milligan AISC reconciliation: production costs US$306.3m + third-party smelting/refining/transport US$10.2m; US$195.9m by-product/co-product credits are shown separately and are excluded from the pilot pre-credit common pool',
    }],
    commonPoolUSD: 316_500_000,
    productionByMetal: {
      Cu: { value: 57_600_000 / PUBLIC_CU_COST_LB_PER_TONNE, unit: 'tonne' },
      Au: { value: 171_900, unit: 'toz' },
    },
  },
  {
    id: 'mount-polley-2024',
    operator: 'Imperial Metals',
    mine: 'Mount Polley',
    country: 'Canada',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'FULL_OPERATION',
    status: 'PARTIAL',
    sourceUrl: 'https://www.imperialmetals.com/for-investors/financial-reports',
    sourcePageOrTable: '2024 annual disclosure source-locks 35,700,238 lb Cu and 39,108 oz Au, but reported cash cost is net of by-product and other revenues; an absolute pre-credit common pool is not separately source-locked',
    blockers: ['ABSOLUTE_2024_PRE_BYPRODUCT_COMMON_POOL_NOT_SOURCE_LOCKED_BYPRODUCT_AND_OTHER_REVENUES_INCLUDED_IN_NET_CASH_COST'],
  },
  {
    id: 'red-chris-2024',
    operator: 'Newmont / Imperial Metals JV',
    mine: 'Red Chris',
    country: 'Canada',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'ATTRIBUTABLE',
    status: 'PARTIAL',
    sourceUrl: 'https://www.imperialmetals.com/for-investors/financial-reports',
    sourcePageOrTable: 'Imperial Metals 2024 disclosure reports its 30% share and a cash-cost numerator net of by-product/other revenues; exact 100% physical co-product vector and canonical pre-credit common pool are not jointly source-locked',
    blockers: [
      'SOURCE_OBSERVATION_IS_ATTRIBUTABLE_30_PERCENT_NOT_FULL_OPERATION_WITHOUT_COMPLETE_100_PERCENT_PHYSICAL_VECTOR',
      'ABSOLUTE_2024_PRE_BYPRODUCT_COMMON_POOL_NOT_SOURCE_LOCKED',
    ],
  },
  {
    id: 'robinson-2024',
    operator: 'KGHM International',
    mine: 'Robinson',
    country: 'United States',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'FULL_OPERATION',
    status: 'PARTIAL',
    sourceUrl: 'https://kghm.com/en/investors/results-center/financial-results',
    sourcePageOrTable: '2024 KGHM disclosures define C1 on payable-copper basis after by-product value; mine-level exact contained Cu/co-product vector and absolute pre-by-product common pool were not source-locked in this pass',
    blockers: ['PAYABLE_CU_C1_DENOMINATOR_AND_FULL_PHYSICAL_COPRODUCT_VECTOR_NOT_SOURCE_LOCKED_FOR_CANONICAL_CONTAINED_CU_REBASE'],
  },
];

export type PublicCuBatch6Failure = { status: 'NOT_VERIFIED'; id: string; mine: string; blockers: string[] };

function referenceValue(metal: PublicCuBatch6Metal, quantity: PublicCuBatch6Quantity): number | null {
  if (!(quantity.value > 0)) return null;
  if (metal === 'Zn') {
    return quantity.unit === 'tonne'
      ? quantity.value * TIER_PUBLIC_CU_COST_BATCH6_POLICY.supplementalPriceDeck.Zn.value
      : null;
  }
  if (metal === 'Pb') {
    return quantity.unit === 'tonne'
      ? quantity.value * TIER_PUBLIC_CU_COST_BATCH6_POLICY.supplementalPriceDeck.Pb.value
      : null;
  }
  const row = TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.byMetal[metal as 'Cu' | 'Au' | 'Ag' | 'Mo'];
  if (!row) return null;
  if (metal === 'Cu' || metal === 'Mo') {
    return quantity.unit === 'tonne' && row.unit === 'USD_PER_LB'
      ? quantity.value * PUBLIC_CU_COST_LB_PER_TONNE * row.value
      : null;
  }
  return quantity.unit === 'toz' && row.unit === 'USD_PER_TOZ' ? quantity.value * row.value : null;
}

export function normalizePublicCuBatch6Observation(row: PublicCuBatch6Observation): PublicCuPilotNormalizedObservation | PublicCuBatch6Failure {
  const blockers = [...(row.status === 'PARTIAL' ? (row.blockers ?? ['PARTIAL']) : [])];
  if (row.dataYear !== 2024) blockers.push(`DATA_YEAR_${row.dataYear}_DOES_NOT_MATCH_2024`);
  if (row.reportingPeriod !== 'FULL_CALENDAR_YEAR') blockers.push(`REPORTING_PERIOD_${row.reportingPeriod}_DOES_NOT_MATCH_FULL_CALENDAR_YEAR`);
  if (row.operationBasis !== 'FULL_OPERATION') blockers.push(`OPERATION_BASIS_${row.operationBasis}_DOES_NOT_MATCH_FULL_OPERATION`);
  if (!row.sourceUrl || !row.sourcePageOrTable) blockers.push('MISSING_SOURCE_PROVENANCE');
  if (row.supportingSources?.some((source) => !source.sourceUrl || !source.sourcePageOrTable)) blockers.push('MISSING_SUPPORTING_SOURCE_PROVENANCE');
  if (blockers.length) return { status: 'NOT_VERIFIED', id: row.id, mine: row.mine, blockers };
  if (!(row.commonPoolUSD && row.commonPoolUSD > 0)) return { status: 'NOT_VERIFIED', id: row.id, mine: row.mine, blockers: ['MISSING_OR_INVALID_COMMON_POOL'] };
  const cu = row.productionByMetal?.Cu;
  if (!cu || cu.unit !== 'tonne' || !(cu.value > 0)) return { status: 'NOT_VERIFIED', id: row.id, mine: row.mine, blockers: ['MISSING_CONTAINED_CU_PRODUCTION'] };

  let totalReferenceValueUSD = 0;
  let cuReferenceValueUSD = 0;
  const byMetal: Record<string, number> = {};
  for (const [metal, quantity] of Object.entries(row.productionByMetal ?? {}) as Array<[PublicCuBatch6Metal, PublicCuBatch6Quantity]>) {
    const valueUSD = referenceValue(metal, quantity);
    if (!(valueUSD && valueUSD > 0)) return { status: 'NOT_VERIFIED', id: row.id, mine: row.mine, blockers: [`UNSUPPORTED_OR_INVALID_PRODUCT_${metal}`] };
    byMetal[metal] = valueUSD;
    totalReferenceValueUSD += valueUSD;
    if (metal === 'Cu') cuReferenceValueUSD = valueUSD;
  }
  if (!(cuReferenceValueUSD > 0 && totalReferenceValueUSD > 0)) return { status: 'NOT_VERIFIED', id: row.id, mine: row.mine, blockers: ['INVALID_REFERENCE_VALUE_VECTOR'] };

  const cuLb = cu.value * PUBLIC_CU_COST_LB_PER_TONNE;
  const share = cuReferenceValueUSD / totalReferenceValueUSD;
  const preAllocation = row.commonPoolUSD / cuLb;
  return {
    status: 'NORMALIZED', id: row.id, mine: row.mine, commonPoolUSD: row.commonPoolUSD,
    preAllocationCashCostUSDPerLbContainedCu: preAllocation,
    copperReferenceValueShare: share,
    normalizedCuCostUSDPerLbContainedCu: preAllocation * share,
    copperContainedTonnes: cu.value,
    referenceValueUSDByMetal: byMetal as PublicCuPilotNormalizedObservation['referenceValueUSDByMetal'],
  };
}

function productionWeighted(rows: PublicCuPilotNormalizedObservation[], quantile: number): number {
  const sorted = [...rows].sort((a, b) => a.normalizedCuCostUSDPerLbContainedCu - b.normalizedCuCostUSDPerLbContainedCu);
  const target = sorted.reduce((sum, row) => sum + row.copperContainedTonnes, 0) * quantile;
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.copperContainedTonnes;
    if (cumulative >= target) return row.normalizedCuCostUSDPerLbContainedCu;
  }
  return Number.NaN;
}

function mineWeighted(rows: PublicCuPilotNormalizedObservation[], quantile: number): number {
  const sorted = [...rows].sort((a, b) => a.normalizedCuCostUSDPerLbContainedCu - b.normalizedCuCostUSDPerLbContainedCu);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index]?.normalizedCuCostUSDPerLbContainedCu ?? Number.NaN;
}

function concentration(rows: PublicCuPilotNormalizedObservation[], topN: number): number {
  const total = rows.reduce((sum, row) => sum + row.copperContainedTonnes, 0);
  if (!(total > 0)) return Number.NaN;
  return [...rows]
    .sort((a, b) => b.copperContainedTonnes - a.copperContainedTonnes)
    .slice(0, topN)
    .reduce((sum, row) => sum + row.copperContainedTonnes, 0) / total;
}

export function buildBatch6PublicCuPilotCurve() {
  const prior = buildBatch5PublicCuPilotCurve();
  const supersededPartialIds = new Set(['mount-milligan-2024']);
  const priorFailures = prior.failures.filter((row) => !supersededPartialIds.has(row.id));
  const results = PUBLIC_CU_COST_BATCH6_OBSERVATIONS.map(normalizePublicCuBatch6Observation);
  const addedNormalized = results.filter((row): row is PublicCuPilotNormalizedObservation => row.status === 'NORMALIZED');
  const addedFailures = results.filter((row): row is PublicCuBatch6Failure => row.status === 'NOT_VERIFIED');
  const normalized = [...prior.normalized, ...addedNormalized];
  const failures = [...priorFailures, ...addedFailures];
  const totalContainedCuTonnes = normalized.reduce((sum, row) => sum + row.copperContainedTonnes, 0);
  const ready = normalized.length >= TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles;
  const byProduction = [...normalized].sort((a, b) => b.copperContainedTonnes - a.copperContainedTonnes);
  const largest = byProduction[0] ?? null;
  const withoutLargest = largest ? normalized.filter((row) => row.id !== largest.id) : [];

  return {
    status: ready ? 'RESEARCH_CURVE_READY' as const : 'NOT_READY' as const,
    comparisonEnabled: false,
    reviewedObservationCount: normalized.length + failures.length,
    eligibleObservationCount: normalized.length,
    partialObservationCount: failures.length,
    minimumRequired: TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles,
    totalContainedCuTonnes,
    q1Max: ready ? productionWeighted(normalized, 0.25) : null,
    p50Max: ready ? productionWeighted(normalized, 0.50) : null,
    p75Max: ready ? productionWeighted(normalized, 0.75) : null,
    diagnostics: ready ? {
      largestObservationId: largest?.id ?? null,
      largestObservationWeightShare: concentration(normalized, 1),
      top3WeightShare: concentration(normalized, 3),
      top5WeightShare: concentration(normalized, 5),
      top10WeightShare: concentration(normalized, 10),
      mineWeightedQ1: mineWeighted(normalized, 0.25),
      mineWeightedP50: mineWeighted(normalized, 0.50),
      mineWeightedP75: mineWeighted(normalized, 0.75),
      leaveLargestOutQ1: withoutLargest.length ? productionWeighted(withoutLargest, 0.25) : null,
      leaveLargestOutP50: withoutLargest.length ? productionWeighted(withoutLargest, 0.50) : null,
      leaveLargestOutP75: withoutLargest.length ? productionWeighted(withoutLargest, 0.75) : null,
    } : null,
    normalized,
    failures,
  };
}
