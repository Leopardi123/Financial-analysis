import {
  PUBLIC_CU_COST_LB_PER_TONNE,
  TIER_PUBLIC_CU_COST_PILOT_POLICY,
  type PublicCuPilotNormalizedObservation,
} from './publicCuCostCurve.ts';
import {
  buildExpandedPublicCuPilotCurve,
} from './publicCuCostCurveBatch2.ts';

export type PublicCuBatch3Metal = 'Cu' | 'Au' | 'Ag' | 'Mo' | 'Zn';
export type PublicCuBatch3Quantity = { value: number; unit: 'tonne' | 'toz' };
export type PublicCuBatch3Observation = {
  id: string;
  operator: string;
  mine: string;
  dataYear: number;
  reportingPeriod: 'FULL_CALENDAR_YEAR' | 'PARTIAL_YEAR';
  operationBasis: 'FULL_OPERATION' | 'ATTRIBUTABLE';
  status: 'ELIGIBLE_FOR_PILOT' | 'PARTIAL';
  sourceUrl: string;
  sourcePageOrTable: string;
  supportingSources?: Array<{ sourceUrl: string; sourcePageOrTable: string }>;
  commonPoolUSD?: number;
  productionByMetal?: Partial<Record<PublicCuBatch3Metal, PublicCuBatch3Quantity>>;
  blockers?: string[];
};

export const TIER_PUBLIC_CU_COST_BATCH3_POLICY = {
  ...TIER_PUBLIC_CU_COST_PILOT_POLICY,
  reportingPeriod: 'FULL_CALENDAR_YEAR' as const,
  operationBasis: 'FULL_OPERATION' as const,
  supplementalPriceDeck: {
    Zn: {
      value: 2_779.02,
      unit: 'USD_PER_TONNE' as const,
      sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1713930/000129281425001097/nexaform20f_2024.htm',
      sourcePageOrTable: 'Nexa Resources 2024 Form 20-F, average LME zinc price: US$2,779.02/t for 2024',
    },
  },
} as const;

export const PUBLIC_CU_COST_BATCH3_OBSERVATIONS: PublicCuBatch3Observation[] = [
  {
    id: 'mantos-blancos-2024', operator: 'Capstone Copper', mine: 'Mantos Blancos', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://capstonecopper.com/wp-content/uploads/2025/03/2024-Capstone-Copper-Corp-Year-end-Report-to-Shareholders.pdf',
    sourcePageOrTable: '2024 MD&A pp.16, 37: contained Cu 37,744 t concentrate + 6,830 t cathode; Ag 830 koz; cash production costs US$264.9m; treatment/selling US$0.26/lb on 95.439m payable lb',
    commonPoolUSD: 264_900_000 + 0.26 * 95_439_000,
    productionByMetal: { Cu: { value: 44_574, unit: 'tonne' }, Ag: { value: 830_000, unit: 'toz' } },
  },
  {
    id: 'mantoverde-2024', operator: 'Capstone Copper', mine: 'Mantoverde', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://capstonecopper.com/wp-content/uploads/2025/03/2024-Capstone-Copper-Corp-Year-end-Report-to-Shareholders.pdf',
    sourcePageOrTable: '2024 MD&A pp.18, 37: 100%-basis contained Cu 57,707 t; Au 9,237 oz; cash production costs US$365.6m; treatment/selling US$0.15/lb on 125.589m payable lb',
    commonPoolUSD: 365_600_000 + 0.15 * 125_589_000,
    productionByMetal: { Cu: { value: 57_707, unit: 'tonne' }, Au: { value: 9_237, unit: 'toz' } },
  },
  {
    id: 'cozamin-2024', operator: 'Capstone Copper', mine: 'Cozamin', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://capstonecopper.com/wp-content/uploads/2025/03/2024-Capstone-Copper-Corp-Year-end-Report-to-Shareholders.pdf',
    sourcePageOrTable: '2024 MD&A operating statistics and p.37: contained Cu 24,907 t; Ag 1,462 koz; cash production costs US$95.4m; treatment/selling US$0.33/lb on 52.767m payable lb',
    commonPoolUSD: 95_400_000 + 0.33 * 52_767_000,
    productionByMetal: { Cu: { value: 24_907, unit: 'tonne' }, Ag: { value: 1_462_000, unit: 'toz' } },
  },
  {
    id: 'cayeli-2024', operator: 'First Quantum Minerals', mine: 'Çayeli', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://www.first-quantum.com/files/doc_downloads/2025/03/First-Quantum-AR-Final.pdf',
    sourcePageOrTable: '2024 Annual Report: production 11,491 t Cu and 2,629 t Zn; annual C1 reconciliation US$49m after US$8m by-product credits',
    supportingSources: [{ sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1713930/000129281425001097/nexaform20f_2024.htm', sourcePageOrTable: 'Independent public 2024 average LME zinc price US$2,779.02/t used only for the common fixed-deck allocation' }],
    commonPoolUSD: 57_000_000,
    productionByMetal: { Cu: { value: 11_491, unit: 'tonne' }, Zn: { value: 2_629, unit: 'tonne' } },
  },
  {
    id: 'pinto-valley-2024', operator: 'Capstone Copper', mine: 'Pinto Valley', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'PARTIAL',
    sourceUrl: 'https://capstonecopper.com/wp-content/uploads/2025/03/2024-Annual-Information-Form.pdf',
    sourcePageOrTable: '2024 AIF / MD&A: Cu is source-locked but Ag/Au/Mo are economic products; AIF notes gold/silver assay timing and estimates',
    blockers: ['EXACT_2024_PHYSICAL_CO_PRODUCT_VECTOR_NOT_SOURCE_LOCKED_FOR_AG_AU_MO'],
  },
  {
    id: 'mount-milligan-2024', operator: 'Centerra Gold', mine: 'Mount Milligan', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'PARTIAL',
    sourceUrl: 'https://www.centerragold.com/investor-news/news-details/2025/Centerra-Gold-Reports-Fourth-Quarter-and-Full-Year-2024-Results-and-2025-Outlook-Strong-Cash-Flow-from-Operating-Activities-and-625-Million-in-Cash-and-Cash-Equivalents-02-20-2025/default.aspx',
    sourcePageOrTable: '2024 full-year results: 167,579 oz Au; 54.3m lb Cu; cost bridge 306.3m production + 10.2m smelting/refining/transport before credits',
    blockers: ['CENTERA_SOURCE_EXPLICITLY_LABELS_2024_COPPER_QUANTITY_PAYABLE_CU_PRODUCED_NOT_CONTAINED_CU_PRODUCED'],
  },
  {
    id: 'lumwana-2024', operator: 'Barrick', mine: 'Lumwana', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'PARTIAL',
    sourceUrl: 'https://www.barrick.com/English/news/news-details/2025/q4-2024-results/default.aspx',
    sourcePageOrTable: '2024 copper production/cost summary: 123 kt Cu, C1 US$2.23/lb',
    blockers: ['SITE_LEVEL_ABSOLUTE_PRE_BYPRODUCT_COMMON_POOL_OR_EXACT_C1_DENOMINATOR_NOT_SOURCE_LOCKED_FOR_SAFE_REBASE_TO_CONTAINED_CU_PRODUCED'],
  },
  {
    id: 'quellaveco-2024', operator: 'Anglo American', mine: 'Quellaveco', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'PARTIAL',
    sourceUrl: 'https://www.angloamerican.com/investors/results-centre-and-presentations',
    sourcePageOrTable: '2024 annual results / production disclosures',
    blockers: ['EXACT_2024_PRE_BYPRODUCT_COMMON_CASH_POOL_NOT_SOURCE_LOCKED'],
  },
  {
    id: 'guelb-moghrein-2024', operator: 'First Quantum Minerals', mine: 'Guelb Moghrein', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'PARTIAL',
    sourceUrl: 'https://www.first-quantum.com/files/doc_downloads/2025/03/First-Quantum-AR-Final.pdf',
    sourcePageOrTable: '2024 Annual Report production and unit-cost tables',
    blockers: ['ECONOMIC_MAGNETITE_CONCENTRATE_PRODUCT_HAS_NO_SOURCE_LOCKED_REFERENCE_PRICE_IN_PUBLIC_CURVE_POLICY'],
  },
  {
    id: 'new-afton-2024', operator: 'New Gold', mine: 'New Afton', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'PARTIAL',
    sourceUrl: 'https://newgold.com/investors/reports-and-financials/default.aspx',
    sourcePageOrTable: '2024 MD&A and New Afton operating statistics',
    blockers: ['2024_ECONOMIC_SILVER_BYPRODUCT_PHYSICAL_PRODUCTION_NOT_SOURCE_LOCKED'],
  },
];

export type PublicCuBatch3Failure = { status: 'NOT_VERIFIED'; id: string; mine: string; blockers: string[] };

function referenceValue(metal: PublicCuBatch3Metal, q: PublicCuBatch3Quantity): number | null {
  if (!(q.value > 0)) return null;
  if (metal === 'Zn') return q.unit === 'tonne' ? q.value * TIER_PUBLIC_CU_COST_BATCH3_POLICY.supplementalPriceDeck.Zn.value : null;
  const row = TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.byMetal[metal as 'Cu' | 'Au' | 'Ag' | 'Mo'];
  if (!row) return null;
  if (metal === 'Cu' || metal === 'Mo') return q.unit === 'tonne' && row.unit === 'USD_PER_LB' ? q.value * PUBLIC_CU_COST_LB_PER_TONNE * row.value : null;
  return q.unit === 'toz' && row.unit === 'USD_PER_TOZ' ? q.value * row.value : null;
}

export function normalizePublicCuBatch3Observation(row: PublicCuBatch3Observation): PublicCuPilotNormalizedObservation | PublicCuBatch3Failure {
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
  for (const [metal, quantity] of Object.entries(row.productionByMetal ?? {}) as Array<[PublicCuBatch3Metal, PublicCuBatch3Quantity]>) {
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

function weighted(rows: PublicCuPilotNormalizedObservation[], quantile: number): number {
  const sorted = [...rows].sort((a, b) => a.normalizedCuCostUSDPerLbContainedCu - b.normalizedCuCostUSDPerLbContainedCu);
  const target = sorted.reduce((sum, row) => sum + row.copperContainedTonnes, 0) * quantile;
  let cumulative = 0;
  for (const row of sorted) {
    cumulative += row.copperContainedTonnes;
    if (cumulative >= target) return row.normalizedCuCostUSDPerLbContainedCu;
  }
  return Number.NaN;
}

export function buildBatch3PublicCuPilotCurve() {
  const prior = buildExpandedPublicCuPilotCurve();
  const batch3Results = PUBLIC_CU_COST_BATCH3_OBSERVATIONS.map(normalizePublicCuBatch3Observation);
  const batch3Normalized = batch3Results.filter((row): row is PublicCuPilotNormalizedObservation => row.status === 'NORMALIZED');
  const batch3Failures = batch3Results.filter((row): row is PublicCuBatch3Failure => row.status === 'NOT_VERIFIED');
  const normalized = [...prior.normalized, ...batch3Normalized];
  const failures = [...prior.failures, ...batch3Failures];
  const totalContainedCuTonnes = normalized.reduce((sum, row) => sum + row.copperContainedTonnes, 0);
  const ready = normalized.length >= TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles;
  return {
    status: ready ? 'RESEARCH_CURVE_READY' as const : 'NOT_READY' as const,
    comparisonEnabled: false,
    reviewedObservationCount: prior.reviewedObservationCount + PUBLIC_CU_COST_BATCH3_OBSERVATIONS.length,
    eligibleObservationCount: normalized.length,
    partialObservationCount: failures.length,
    minimumRequired: TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles,
    totalContainedCuTonnes,
    normalized,
    failures,
    q1Max: ready ? weighted(normalized, 0.25) : null,
    p50Max: ready ? weighted(normalized, 0.50) : null,
    p75Max: ready ? weighted(normalized, 0.75) : null,
  };
}
