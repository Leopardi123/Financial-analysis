import {
  PUBLIC_CU_COST_LB_PER_TONNE,
  PUBLIC_CU_COST_PILOT_OBSERVATIONS,
  TIER_PUBLIC_CU_COST_PILOT_POLICY,
  normalizePublicCuCostObservation,
  type PublicCuPilotNormalizedObservation,
} from './publicCuCostCurve.ts';

export type PublicCuBatch2Metal = 'Cu' | 'Au' | 'Ag' | 'Mo' | 'Co';
export type PublicCuBatch2Quantity = { value: number; unit: 'tonne' | 'toz' };
export type PublicCuBatch2Observation = {
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
  commonPoolUSDPerLbContainedCu?: number;
  productionByMetal?: Partial<Record<PublicCuBatch2Metal, PublicCuBatch2Quantity>>;
  blockers?: string[];
};

export const TIER_PUBLIC_CU_COST_BATCH2_POLICY = {
  ...TIER_PUBLIC_CU_COST_PILOT_POLICY,
  reportingPeriod: 'FULL_CALENDAR_YEAR' as const,
  operationBasis: 'FULL_OPERATION' as const,
  supplementalPriceDeck: {
    Co: {
      value: 11.26,
      unit: 'USD_PER_LB' as const,
      sourceUrl: 'https://www1.hkexnews.hk/listedco/listconews/sehk/2025/0424/2025042400242.pdf',
      sourcePageOrTable: 'Jinchuan Group International 2024 Annual Report p.25, Market Review: average MB cobalt metal price US$11.26/lb in 2024',
    },
  },
} as const;

export const PUBLIC_CU_COST_BATCH2_OBSERVATIONS: PublicCuBatch2Observation[] = [
  {
    id: 'centinela-2024', operator: 'Antofagasta plc', mine: 'Centinela', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://www.antofagasta.co.uk/media/4767/antofagasta-annual-report-2024-web-version-25-march-2-compressed.pdf',
    sourcePageOrTable: '2024 Annual Report operating review and production/sales statistics',
    commonPoolUSDPerLbContainedCu: 2.60,
    productionByMetal: { Cu: { value: 223_800, unit: 'tonne' }, Au: { value: 140_300, unit: 'toz' }, Ag: { value: 853_500, unit: 'toz' }, Mo: { value: 2_400, unit: 'tonne' } },
  },
  {
    id: 'kounrad-2024', operator: 'Central Asia Metals', mine: 'Kounrad', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://www.lse.co.uk/rns/2024-full-year-results-9f156hcfyc4y8ta.html',
    sourcePageOrTable: '2024 Full-Year Results, Kounrad C1 cash cost table: US$23.740m and 13,439 t Cu',
    commonPoolUSD: 23_740_000, productionByMetal: { Cu: { value: 13_439, unit: 'tonne' } },
  },
  {
    id: 'las-bambas-2024', operator: 'MMG Limited', mine: 'Las Bambas', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://www.mmg.com/content/uploads/2025/03/e_2025-03-04_2024-Annual-Results.pdf',
    sourcePageOrTable: '2024 Annual Results pp.11-12: production expenses US$1,254.1m + freight US$85.2m; royalties separately excluded',
    supportingSources: [{ sourceUrl: 'https://www.mmg.com/content/uploads/2026/01/e_2026-01-22_4QTR-Production-Report.pdf', sourcePageOrTable: 'FY2024 comparison row: Cu 322,912 t; Au 63,427 oz; Ag 3,938,602 oz; contained Mo 3,108 t' }],
    commonPoolUSD: 1_339_300_000,
    productionByMetal: { Cu: { value: 322_912, unit: 'tonne' }, Au: { value: 63_427, unit: 'toz' }, Ag: { value: 3_938_602, unit: 'toz' }, Mo: { value: 3_108, unit: 'tonne' } },
  },
  {
    id: 'kinsevere-2024', operator: 'MMG Limited', mine: 'Kinsevere', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://www.mmg.com/content/uploads/2025/03/e_2025-03-04_2024-Annual-Results.pdf',
    sourcePageOrTable: '2024 Annual Results pp.13-14: production expenses US$327.8m + freight US$10.2m; royalties separately excluded',
    supportingSources: [{ sourceUrl: 'https://www.mmg.com/wp-content/uploads/2025/01/e_2025-01-23_4QTR-Production-Report.pdf', sourcePageOrTable: 'FY2024 production: Cu 44,597 t and Co 2,926 t' }],
    commonPoolUSD: 338_000_000,
    productionByMetal: { Cu: { value: 44_597, unit: 'tonne' }, Co: { value: 2_926, unit: 'tonne' } },
  },
  {
    id: 'el-roble-2024', operator: 'Atico Mining', mine: 'El Roble', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://aticomining.com/_resources/financials/ATY-2024Q4-MDA.pdf?v=050903',
    sourcePageOrTable: '2024 MD&A production statistics and cash-cost reconciliation: production cost + refining + transportation, excluding royalty/by-product credit',
    commonPoolUSD: 46_295_000,
    productionByMetal: { Cu: { value: 13_714_000 / PUBLIC_CU_COST_LB_PER_TONNE, unit: 'tonne' }, Au: { value: 9_106, unit: 'toz' }, Ag: { value: 35_451, unit: 'toz' } },
  },
  {
    id: 'mvc-2024', operator: 'Amerigo Resources', mine: 'Minera Valle Central', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://www.amerigoresources.com/_resources/financials/ARG-Q4-MDA-2024.pdf?v=022812',
    sourcePageOrTable: '2024 MD&A production and cash-cost reconciliation; D&A removed from tolling/production pool; smelting/refining + transportation included; royalty/by-product/inventory excluded as defined',
    commonPoolUSD: 149_268_000,
    productionByMetal: { Cu: { value: 64_600_000 / PUBLIC_CU_COST_LB_PER_TONNE, unit: 'tonne' }, Mo: { value: 1_300_000 / PUBLIC_CU_COST_LB_PER_TONNE, unit: 'tonne' } },
  },
  {
    id: 'antucoya-2024', operator: 'Antofagasta plc', mine: 'Antucoya', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'PARTIAL',
    sourceUrl: 'https://www.antofagasta.co.uk/media/4767/antofagasta-annual-report-2024-web-version-25-march-2-compressed.pdf',
    sourcePageOrTable: '2024 Annual Report operating review vs detailed production statistics',
    blockers: ['SOURCE_CONFLICT_2024_CU_PRODUCTION_80_4_KT_OPERATING_REVIEW_VS_80_5_KT_PRODUCTION_STATISTICS'],
  },
  {
    id: 'zaldivar-2024', operator: 'Antofagasta plc / Barrick JV', mine: 'Zaldívar', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'ATTRIBUTABLE', status: 'PARTIAL',
    sourceUrl: 'https://www.antofagasta.co.uk/media/4767/antofagasta-annual-report-2024-web-version-25-march-2-compressed.pdf',
    sourcePageOrTable: '2024 production statistics expressly reported on attributable 50% basis',
    blockers: ['SOURCE_OBSERVATION_IS_ATTRIBUTABLE_50_PERCENT_NOT_FULL_OPERATION'],
  },
  {
    id: 'khoemacau-2024', operator: 'MMG Limited', mine: 'Khoemacau', dataYear: 2024,
    reportingPeriod: 'PARTIAL_YEAR', operationBasis: 'FULL_OPERATION', status: 'PARTIAL',
    sourceUrl: 'https://www.mmg.com/content/uploads/2025/03/e_2025-03-04_2024-Annual-Results.pdf',
    sourcePageOrTable: '2024 Annual Results: MMG results and 30,962 t Cu cover 23 March-31 December 2024 after acquisition',
    blockers: ['SOURCE_OBSERVATION_COVERS_ONLY_23_MARCH_TO_31_DECEMBER_2024_NOT_FULL_CALENDAR_YEAR'],
  },
  {
    id: 'los-pelambres-2024', operator: 'Antofagasta plc', mine: 'Los Pelambres', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'PARTIAL',
    sourceUrl: 'https://www.antofagasta.co.uk/media/4767/antofagasta-annual-report-2024-web-version-25-march-2-compressed.pdf',
    sourcePageOrTable: '2024 Annual Report operating snapshot vs detailed production statistics',
    blockers: ['SOURCE_CONFLICT_2024_MO_PRODUCTION_8_4_KT_OPERATING_SNAPSHOT_VS_8_3_KT_DETAILED_PRODUCTION_STATISTICS'],
  },
];

export type PublicCuBatch2Normalized = PublicCuPilotNormalizedObservation;
export type PublicCuBatch2Failure = { status: 'NOT_VERIFIED'; id: string; mine: string; blockers: string[] };

function price(metal: PublicCuBatch2Metal): { value: number; unit: 'USD_PER_LB' | 'USD_PER_TOZ' } | null {
  if (metal === 'Co') return TIER_PUBLIC_CU_COST_BATCH2_POLICY.supplementalPriceDeck.Co;
  const row = TIER_PUBLIC_CU_COST_PILOT_POLICY.referencePriceDeck.byMetal[metal as 'Cu' | 'Au' | 'Ag' | 'Mo'];
  return row ? { value: row.value, unit: row.unit } : null;
}

function referenceValue(metal: PublicCuBatch2Metal, q: PublicCuBatch2Quantity): number | null {
  const p = price(metal);
  if (!p || !(q.value > 0)) return null;
  if (metal === 'Cu' || metal === 'Mo' || metal === 'Co') return q.unit === 'tonne' && p.unit === 'USD_PER_LB' ? q.value * PUBLIC_CU_COST_LB_PER_TONNE * p.value : null;
  return q.unit === 'toz' && p.unit === 'USD_PER_TOZ' ? q.value * p.value : null;
}

export function normalizePublicCuBatch2Observation(row: PublicCuBatch2Observation): PublicCuBatch2Normalized | PublicCuBatch2Failure {
  const blockers = [...(row.status === 'PARTIAL' ? (row.blockers ?? ['PARTIAL']) : [])];
  if (row.dataYear !== 2024) blockers.push(`DATA_YEAR_${row.dataYear}_DOES_NOT_MATCH_2024`);
  if (row.reportingPeriod !== 'FULL_CALENDAR_YEAR') blockers.push(`REPORTING_PERIOD_${row.reportingPeriod}_DOES_NOT_MATCH_FULL_CALENDAR_YEAR`);
  if (row.operationBasis !== 'FULL_OPERATION') blockers.push(`OPERATION_BASIS_${row.operationBasis}_DOES_NOT_MATCH_FULL_OPERATION`);
  if (!row.sourceUrl || !row.sourcePageOrTable) blockers.push('MISSING_SOURCE_PROVENANCE');
  if (row.supportingSources?.some((s) => !s.sourceUrl || !s.sourcePageOrTable)) blockers.push('MISSING_SUPPORTING_SOURCE_PROVENANCE');
  if (blockers.length) return { status: 'NOT_VERIFIED', id: row.id, mine: row.mine, blockers };
  if (!row.productionByMetal?.Cu || row.productionByMetal.Cu.unit !== 'tonne') return { status: 'NOT_VERIFIED', id: row.id, mine: row.mine, blockers: ['MISSING_CONTAINED_CU_PRODUCTION'] };
  const cuTonnes = row.productionByMetal.Cu.value;
  const cuLb = cuTonnes * PUBLIC_CU_COST_LB_PER_TONNE;
  const commonPoolUSD = row.commonPoolUSD ?? ((row.commonPoolUSDPerLbContainedCu ?? Number.NaN) * cuLb);
  if (!(commonPoolUSD > 0)) return { status: 'NOT_VERIFIED', id: row.id, mine: row.mine, blockers: ['MISSING_OR_INVALID_COMMON_POOL'] };
  let total = 0;
  let cuValue = 0;
  const byMetal: Partial<Record<PublicCuBatch2Metal, number>> = {};
  for (const [m, q] of Object.entries(row.productionByMetal) as Array<[PublicCuBatch2Metal, PublicCuBatch2Quantity]>) {
    const v = referenceValue(m, q);
    if (!(v && v > 0)) return { status: 'NOT_VERIFIED', id: row.id, mine: row.mine, blockers: [`UNSUPPORTED_OR_INVALID_PRODUCT_${m}`] };
    byMetal[m] = v; total += v; if (m === 'Cu') cuValue = v;
  }
  const share = cuValue / total;
  return {
    status: 'NORMALIZED', id: row.id, mine: row.mine, commonPoolUSD,
    preAllocationCashCostUSDPerLbContainedCu: commonPoolUSD / cuLb,
    copperReferenceValueShare: share,
    normalizedCuCostUSDPerLbContainedCu: (commonPoolUSD / cuLb) * share,
    copperContainedTonnes: cuTonnes,
    referenceValueUSDByMetal: byMetal as PublicCuPilotNormalizedObservation['referenceValueUSDByMetal'],
  };
}

function weighted(rows: PublicCuPilotNormalizedObservation[], q: number): number {
  const sorted = [...rows].sort((a, b) => a.normalizedCuCostUSDPerLbContainedCu - b.normalizedCuCostUSDPerLbContainedCu);
  const target = sorted.reduce((s, r) => s + r.copperContainedTonnes, 0) * q;
  let cumulative = 0;
  for (const row of sorted) { cumulative += row.copperContainedTonnes; if (cumulative >= target) return row.normalizedCuCostUSDPerLbContainedCu; }
  return Number.NaN;
}

export function buildExpandedPublicCuPilotCurve() {
  const firstBatchIds = new Set(['kamoa-kakula-2024', 'hudbay-peru-2024', 'copper-mountain-2024', 'kansanshi-2024', 'sentinel-2024', 'caraiba-2024', 'candelaria-2024', 'caserones-2024', 'chapada-2024']);
  const baseRows = PUBLIC_CU_COST_PILOT_OBSERVATIONS.filter((row) => firstBatchIds.has(row.id));
  const baseResults = baseRows.map(normalizePublicCuCostObservation);
  const batchResults = PUBLIC_CU_COST_BATCH2_OBSERVATIONS.map(normalizePublicCuBatch2Observation);
  const results = [...baseResults, ...batchResults];
  const normalized = results.filter((r): r is PublicCuPilotNormalizedObservation => r.status === 'NORMALIZED');
  const failures = results.filter((r): r is PublicCuBatch2Failure => r.status === 'NOT_VERIFIED');
  const totalContainedCuTonnes = normalized.reduce((s, r) => s + r.copperContainedTonnes, 0);
  const ready = normalized.length >= TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles;
  return {
    status: ready ? 'RESEARCH_CURVE_READY' as const : 'NOT_READY' as const,
    comparisonEnabled: false,
    reviewedObservationCount: results.length,
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
