import {
  PUBLIC_CU_COST_LB_PER_TONNE,
  TIER_PUBLIC_CU_COST_PILOT_POLICY,
  type PublicCuPilotNormalizedObservation,
} from './publicCuCostCurve.ts';
import {
  TIER_PUBLIC_CU_COST_BATCH4_POLICY,
  buildBatch4PublicCuPilotCurve,
} from './publicCuCostCurveBatch4.ts';

export type PublicCuBatch5Metal = 'Cu' | 'Au' | 'Ag' | 'Mo' | 'Zn' | 'Pb';
export type PublicCuBatch5Quantity = { value: number; unit: 'tonne' | 'toz' };
export type PublicCuBatch5Observation = {
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
  productionByMetal?: Partial<Record<PublicCuBatch5Metal, PublicCuBatch5Quantity>>;
  blockers?: string[];
};

export const TIER_PUBLIC_CU_COST_BATCH5_POLICY = {
  ...TIER_PUBLIC_CU_COST_PILOT_POLICY,
  reportingPeriod: 'FULL_CALENDAR_YEAR' as const,
  operationBasis: 'FULL_OPERATION' as const,
  supplementalPriceDeck: TIER_PUBLIC_CU_COST_BATCH4_POLICY.supplementalPriceDeck,
  supplementalFx: {
    AUD_USD_2024: {
      value: 0.660,
      unit: 'USD_PER_AUD' as const,
      sourceUrl: 'https://announcements.asx.com.au/asxpdf/20250226/pdf/06fyk5rw7zz8gc.pdf',
      sourcePageOrTable: '29Metals Appendix 4E and Annual Financial Report 2024 p.20, Price and FX: Australian dollar (period average) AU$:US$ 0.660 for year ended 31 December 2024',
    },
  },
} as const;

const TRITTON_2024_COMMON_POOL_AUD =
  (23.9 + 7.0 + 5.2 + 4.0 + 2.9) * 1_000_000 +
  (30.7 + 8.2 + 5.7 + 4.3 + 4.8) * 1_000_000 +
  (27.4 + 7.4 + 5.2 + 4.2 + 3.7) * 1_000_000 +
  (24.9 + 7.8 + 6.5 + 3.4 + 3.2) * 1_000_000;

export const PUBLIC_CU_COST_BATCH5_OBSERVATIONS: PublicCuBatch5Observation[] = [
  {
    id: 'motheo-2024',
    operator: 'Sandfire Resources',
    mine: 'Motheo Copper Operations',
    country: 'Botswana',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'FULL_OPERATION',
    status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://announcements.asx.com.au/asxpdf/20250130/pdf/06dysxt1x3f6ws.pdf',
    sourcePageOrTable: 'December 2024 Quarterly Report Appendix A pp.15-16: calendar-2024 contained production is Q3 FY24 + Q4 FY24 + Q1 FY25 + Q2 FY25 = 49,721 t Cu and 1,929 koz Ag; Gross C1 Costs for the same quarters are US$44m + US$59m + US$53m + US$47m = US$203m before by-product credits',
    supportingSources: [{
      sourceUrl: 'https://announcements.asx.com.au/asxpdf/20250130/pdf/06dysxt1x3f6ws.pdf',
      sourcePageOrTable: 'December 2024 Quarterly Report p.11 notes (i) and Appendix A: C1 includes mining, processing, G&A and transport; TCRC is added separately to Gross C1; by-product credit is then deducted, so Gross C1 matches the pilot pre-credit boundary without royalties or sustaining capital',
    }],
    commonPoolUSD: 203_000_000,
    productionByMetal: {
      Cu: { value: 49_721, unit: 'tonne' },
      Ag: { value: 1_929_000, unit: 'toz' },
    },
  },
  {
    id: 'tritton-2024',
    operator: 'Aeris Resources',
    mine: 'Tritton Operations',
    country: 'Australia',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'FULL_OPERATION',
    status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://aerisresources.com.au/wp-content/uploads/2024/05/Aeris-Quarterly-Report-March-2024-Release-Version.pdf',
    sourcePageOrTable: 'Aeris Tritton quarterly operating tables for Mar/Jun/Sep/Dec 2024: calendar production 18.6 kt Cu, 5.3 koz Au and 159.0 koz Ag; canonical quarterly pools sum mining + processing + site G&A + TC/RC + product handling to A$190.4m, excluding by-product credits, royalties, corporate G&A, inventory movements and sustaining capital',
    supportingSources: [
      {
        sourceUrl: 'https://clients3.weblink.com.au/clients/aerisresources/v2/headline.aspx?headlineid=61218040',
        sourcePageOrTable: 'June 2024 Quarterly Report p.3 Tritton table: 5.4 kt Cu, 1.5 koz Au, 42.6 koz Ag; canonical pool A$53.7m',
      },
      {
        sourceUrl: 'https://clients3.weblink.com.au/clients/aerisresources/v2/headline.aspx?headlineid=61234562',
        sourcePageOrTable: 'September 2024 Quarterly Report p.3 Tritton table: 5.0 kt Cu, 1.5 koz Au, 43.9 koz Ag; canonical pool A$47.9m',
      },
      {
        sourceUrl: 'https://clients3.weblink.com.au/clients/aerisresources/v2/headline.aspx?headlineid=61249268',
        sourcePageOrTable: 'December 2024 Quarterly Report p.3 Tritton table: 3.9 kt Cu, 1.1 koz Au, 35.2 koz Ag; canonical pool A$45.8m',
      },
      {
        sourceUrl: 'https://announcements.asx.com.au/asxpdf/20250226/pdf/06fyk5rw7zz8gc.pdf',
        sourcePageOrTable: 'Independent source-locked 2024 period-average AU$:US$ 0.660; used only to translate the A$190.4m absolute common pool to US$125.664m',
      },
    ],
    commonPoolUSD: TRITTON_2024_COMMON_POOL_AUD * TIER_PUBLIC_CU_COST_BATCH5_POLICY.supplementalFx.AUD_USD_2024.value,
    productionByMetal: {
      Cu: { value: 18_600, unit: 'tonne' },
      Au: { value: 5_300, unit: 'toz' },
      Ag: { value: 159_000, unit: 'toz' },
    },
  },
  {
    id: 'riotinto-2024',
    operator: 'Atalaya Mining',
    mine: 'Proyecto Riotinto',
    country: 'Spain',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'FULL_OPERATION',
    status: 'PARTIAL',
    sourceUrl: 'https://atalayamining.com/operations/riotinto-district/riotinto-15-mtpa-plant/',
    sourcePageOrTable: 'Riotinto operating history source-locks 2024 contained Cu production at 46,227 t and payable Cu at 43,706 t; annual financial disclosure provides a cash-cost bridge, but no exact physical 2024 silver production quantity was source-locked in this pass',
    blockers: ['EXACT_2024_PHYSICAL_SILVER_PRODUCTION_NOT_SOURCE_LOCKED'],
  },
  {
    id: 'gibraltar-2024',
    operator: 'Taseko Mines / Gibraltar Mine JV',
    mine: 'Gibraltar',
    country: 'Canada',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'FULL_OPERATION',
    status: 'PARTIAL',
    sourceUrl: 'https://www.tasekomines.com/_resources/financials/Q4-2024.pdf',
    sourcePageOrTable: '2024 MD&A source-locks 100%-basis site/off-property C1 components and 1.4 Mlb molybdenum production; silver is an economic by-product but exact physical 2024 silver production is not disclosed strongly enough for fixed-deck allocation',
    blockers: ['EXACT_2024_PHYSICAL_SILVER_PRODUCTION_NOT_SOURCE_LOCKED'],
  },
  {
    id: 'aitik-2024',
    operator: 'Boliden',
    mine: 'Aitik',
    country: 'Sweden',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'FULL_OPERATION',
    status: 'PARTIAL',
    sourceUrl: 'https://investors.boliden.com/sites/boliden-ir/files/pr/202502052475-1.pdf?ts=1738824388',
    sourcePageOrTable: '2024 year-end mine table source-locks metal in concentrate: 59,818 t Cu, 44,322 oz Au and 767 koz Ag, and reports Cash Cost Normal C1 246 USc/lb; Normal C1 is already net of by-metal revenue and the absolute pre-by-product common pool is not separately source-locked',
    blockers: ['ABSOLUTE_2024_PRE_BYPRODUCT_COMMON_POOL_NOT_SOURCE_LOCKED'],
  },
  {
    id: 'matsa-2024',
    operator: 'Sandfire Resources',
    mine: 'MATSA',
    country: 'Spain',
    dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR',
    operationBasis: 'FULL_OPERATION',
    status: 'PARTIAL',
    sourceUrl: 'https://announcements.asx.com.au/asxpdf/20250130/pdf/06dysxt1x3f6ws.pdf',
    sourcePageOrTable: 'December 2024 Quarterly Report Appendix A source-locks calendar-quarter Cu/Zn/Pb/Ag contained production and Gross C1 pools, but the table reports gold only on sales/payable basis rather than exact contained gold production',
    blockers: ['EXACT_2024_CONTAINED_GOLD_PRODUCTION_NOT_SOURCE_LOCKED'],
  },
];

export type PublicCuBatch5Failure = { status: 'NOT_VERIFIED'; id: string; mine: string; blockers: string[] };

function referenceValue(metal: PublicCuBatch5Metal, quantity: PublicCuBatch5Quantity): number | null {
  if (!(quantity.value > 0)) return null;
  if (metal === 'Zn') {
    return quantity.unit === 'tonne'
      ? quantity.value * TIER_PUBLIC_CU_COST_BATCH5_POLICY.supplementalPriceDeck.Zn.value
      : null;
  }
  if (metal === 'Pb') {
    return quantity.unit === 'tonne'
      ? quantity.value * TIER_PUBLIC_CU_COST_BATCH5_POLICY.supplementalPriceDeck.Pb.value
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

export function normalizePublicCuBatch5Observation(row: PublicCuBatch5Observation): PublicCuPilotNormalizedObservation | PublicCuBatch5Failure {
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
  for (const [metal, quantity] of Object.entries(row.productionByMetal ?? {}) as Array<[PublicCuBatch5Metal, PublicCuBatch5Quantity]>) {
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
    status: 'NORMALIZED',
    id: row.id,
    mine: row.mine,
    commonPoolUSD: row.commonPoolUSD,
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

function mineWeighted(rows: PublicCuPilotNormalizedObservation[], quantile: number): number {
  const sorted = [...rows].sort((a, b) => a.normalizedCuCostUSDPerLbContainedCu - b.normalizedCuCostUSDPerLbContainedCu);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index]?.normalizedCuCostUSDPerLbContainedCu ?? Number.NaN;
}

function concentration(rows: PublicCuPilotNormalizedObservation[], count: number): number {
  const total = rows.reduce((sum, row) => sum + row.copperContainedTonnes, 0);
  if (!(total > 0)) return Number.NaN;
  return [...rows]
    .sort((a, b) => b.copperContainedTonnes - a.copperContainedTonnes)
    .slice(0, count)
    .reduce((sum, row) => sum + row.copperContainedTonnes, 0) / total;
}

export function buildBatch5PublicCuPilotCurve() {
  const prior = buildBatch4PublicCuPilotCurve();
  const batch5Results = PUBLIC_CU_COST_BATCH5_OBSERVATIONS.map(normalizePublicCuBatch5Observation);
  const batch5Normalized = batch5Results.filter((row): row is PublicCuPilotNormalizedObservation => row.status === 'NORMALIZED');
  const batch5Failures = batch5Results.filter((row): row is PublicCuBatch5Failure => row.status === 'NOT_VERIFIED');
  const normalized = [...prior.normalized, ...batch5Normalized];
  const failures = [...prior.failures, ...batch5Failures];
  const totalContainedCuTonnes = normalized.reduce((sum, row) => sum + row.copperContainedTonnes, 0);
  const ready = normalized.length >= TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles;
  const largest = [...normalized].sort((a, b) => b.copperContainedTonnes - a.copperContainedTonnes)[0];
  const leaveLargestOut = largest ? normalized.filter((row) => row.id !== largest.id) : [];

  return {
    status: ready ? 'RESEARCH_CURVE_READY' as const : 'NOT_READY' as const,
    comparisonEnabled: false,
    reviewedObservationCount: normalized.length + failures.length,
    eligibleObservationCount: normalized.length,
    partialObservationCount: failures.length,
    minimumRequired: TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles,
    totalContainedCuTonnes,
    q1Max: ready ? weighted(normalized, 0.25) : null,
    p50Max: ready ? weighted(normalized, 0.50) : null,
    p75Max: ready ? weighted(normalized, 0.75) : null,
    diagnostics: ready ? {
      mineWeightedQ1: mineWeighted(normalized, 0.25),
      mineWeightedP50: mineWeighted(normalized, 0.50),
      mineWeightedP75: mineWeighted(normalized, 0.75),
      largestObservationId: largest?.id ?? null,
      largestObservationWeightShare: concentration(normalized, 1),
      top3WeightShare: concentration(normalized, 3),
      top5WeightShare: concentration(normalized, 5),
      top10WeightShare: concentration(normalized, 10),
      leaveLargestOutQ1: leaveLargestOut.length ? weighted(leaveLargestOut, 0.25) : null,
      leaveLargestOutP50: leaveLargestOut.length ? weighted(leaveLargestOut, 0.50) : null,
      leaveLargestOutP75: leaveLargestOut.length ? weighted(leaveLargestOut, 0.75) : null,
    } : null,
    normalized,
    failures,
  };
}
