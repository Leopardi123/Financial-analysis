import {
  PUBLIC_CU_COST_LB_PER_TONNE,
  TIER_PUBLIC_CU_COST_PILOT_POLICY,
  type PublicCuPilotNormalizedObservation,
} from './publicCuCostCurve.ts';
import {
  TIER_PUBLIC_CU_COST_BATCH3_POLICY,
  buildBatch3PublicCuPilotCurve,
} from './publicCuCostCurveBatch3.ts';

export type PublicCuBatch4Metal = 'Cu' | 'Au' | 'Ag' | 'Mo' | 'Zn' | 'Pb';
export type PublicCuBatch4Quantity = { value: number; unit: 'tonne' | 'toz' };
export type PublicCuBatch4Observation = {
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
  productionByMetal?: Partial<Record<PublicCuBatch4Metal, PublicCuBatch4Quantity>>;
  blockers?: string[];
};

export const TIER_PUBLIC_CU_COST_BATCH4_POLICY = {
  ...TIER_PUBLIC_CU_COST_PILOT_POLICY,
  reportingPeriod: 'FULL_CALENDAR_YEAR' as const,
  operationBasis: 'FULL_OPERATION' as const,
  supplementalPriceDeck: {
    ...TIER_PUBLIC_CU_COST_BATCH3_POLICY.supplementalPriceDeck,
    Pb: {
      value: 2_072,
      unit: 'USD_PER_TONNE' as const,
      sourceUrl: 'https://announcements.asx.com.au/asxpdf/20250226/pdf/06fyk5rw7zz8gc.pdf',
      sourcePageOrTable: '29Metals Appendix 4E and Annual Financial Report 2024, Price and FX table: 2024 average lead price US$2,072/t',
    },
  },
} as const;

export const PUBLIC_CU_COST_BATCH4_OBSERVATIONS: PublicCuBatch4Observation[] = [
  {
    id: 'csa-copper-2024', operator: 'MAC Copper Limited', mine: 'CSA Copper Mine', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1950246/000110465925029012/mtal-20241231x20f.htm',
    sourcePageOrTable: '2024 Form 20-F / Annual Report non-IFRS reconciliation: C1 Cash Cost Before By-product Credits US$186.112m; Copper Tons Produced 41.13 kt',
    supportingSources: [{
      sourceUrl: 'https://s202.q4cdn.com/908723817/files/doc_news/2025-ASX/2025-03-28-Annual-Report.pdf',
      sourcePageOrTable: '2024 Annual Report operating summary: 41,128 t copper and 114.0 koz silver produced; reconciliation separately removes government royalties and sustaining capital from C1',
    }],
    commonPoolUSD: 186_112_000,
    productionByMetal: { Cu: { value: 41_128, unit: 'tonne' }, Ag: { value: 114_000, unit: 'toz' } },
  },
  {
    id: 'bolivar-2024', operator: 'Sierra Metals', mine: 'Bolivar', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://www.smv.gob.pe/ConsultasP8/temp/SMT%20PR_Q4%20and%20FY%202024%20Results_26-03-25_ENG.pdf',
    sourcePageOrTable: 'FY2024 Bolivar cash-cost reconciliation: Total Cash Cost US$70.047m + T&R US$9.656m + selling US$9.981m + site G&A US$5.371m; US$0.760m finished-inventory variation excluded from production-basis common pool',
    supportingSources: [{
      sourceUrl: 'https://www.nasdaq.com/press-release/sierra-metals-reports-strong-fourth-quarter-and-full-year-2024-financial-and',
      sourcePageOrTable: 'FY2024 Bolivar production: 27.454 Mlb Cu, 812 koz Ag and 13,424 oz Au',
    }],
    commonPoolUSD: 70_047_000 + 9_656_000 + 9_981_000 + 5_371_000,
    productionByMetal: {
      Cu: { value: 27_454_000 / PUBLIC_CU_COST_LB_PER_TONNE, unit: 'tonne' },
      Ag: { value: 812_000, unit: 'toz' },
      Au: { value: 13_424, unit: 'toz' },
    },
  },
  {
    id: 'golden-grove-2024', operator: '29Metals', mine: 'Golden Grove', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://announcements.asx.com.au/asxpdf/20250129/pdf/06dxbk4hk33h79.pdf',
    sourcePageOrTable: 'December 2024 Quarterly pp.17-18: mining A$248.2m + processing A$93.9m + site G&A A$25.1m + concentrate transport A$28.7m + TCRC A$78.7m; stockpile movement/by-products/royalties/capital excluded; contained production Cu 21.9 kt, Zn 56.7 kt, Au 21.4 koz, Ag 822 koz and Pb 0.91 kt; FY average USD:AUD 0.660',
    supportingSources: [{
      sourceUrl: 'https://announcements.asx.com.au/asxpdf/20250226/pdf/06fyk5rw7zz8gc.pdf',
      sourcePageOrTable: '2024 Annual Financial Report: contained-metal production vector; period-average AU$:US$ 0.660; 2024 average Pb US$2,072/t; C1 definition confirms mining, processing, site G&A, realisation/transport and TCRC boundary',
    }],
    commonPoolUSD: (248_200_000 + 93_900_000 + 25_100_000 + 28_700_000 + 78_700_000) * 0.660,
    productionByMetal: {
      Cu: { value: 21_900, unit: 'tonne' },
      Zn: { value: 56_700, unit: 'tonne' },
      Au: { value: 21_400, unit: 'toz' },
      Ag: { value: 822_000, unit: 'toz' },
      Pb: { value: 910, unit: 'tonne' },
    },
  },
  {
    id: 'new-afton-2024', operator: 'New Gold', mine: 'New Afton', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://minedocs.com/28/NewAfton-TR-12312024.pdf',
    sourcePageOrTable: 'NI 43-101 Technical Report Table 6-1, Production from New Afton Mine 2012-2024: 2024 Cu 54.0 Mlb, Au 71,550 oz, Ag 144,741 oz',
    supportingSources: [{
      sourceUrl: 'https://www.sec.gov/Archives/edgar/data/800166/000080016626000005/ngdq42025mda.htm',
      sourcePageOrTable: 'New Afton FY2024 comparative cash-cost reconciliation: operating expenses US$160.7m + treatment/refining US$19.7m; silver by-product revenue excluded from pre-credit common pool; sustaining/reclamation excluded',
    }],
    commonPoolUSD: 160_700_000 + 19_700_000,
    productionByMetal: {
      Cu: { value: 54_000_000 / PUBLIC_CU_COST_LB_PER_TONNE, unit: 'tonne' },
      Au: { value: 71_550, unit: 'toz' },
      Ag: { value: 144_741, unit: 'toz' },
    },
  },
  {
    id: 'zaldivar-2024', operator: 'Antofagasta plc / Barrick JV', mine: 'Zaldívar', dataYear: 2024,
    reportingPeriod: 'FULL_CALENDAR_YEAR', operationBasis: 'FULL_OPERATION', status: 'ELIGIBLE_FOR_PILOT',
    sourceUrl: 'https://www.antofagasta.co.uk/media/4803/antofagasta-annual-report-2024-web-version-26-march-compressed_1.pdf',
    sourcePageOrTable: '2024 production statistics: Zaldívar expressly reported at Group attributable 50% basis, 40.1 kt Cu and US$3.02/lb cash cost. Full-operation contained Cu is therefore exact source-locked 80.2 kt; the same 50% scaling is applied to the pure-Cu operating cash pool. Cash cost is defined by Antofagasta as US$/lb copper produced.',
    supportingSources: [{
      sourceUrl: 'https://www.antofagasta.co.uk/investors/news/2025/quarterly-production-report-q1-2025/',
      sourcePageOrTable: 'Antofagasta cash-cost footnote: cash cost is a non-GAAP measure expressing cost of production in US dollars per pound of copper produced',
    }],
    commonPoolUSD: 3.02 * 80_200 * PUBLIC_CU_COST_LB_PER_TONNE,
    productionByMetal: { Cu: { value: 80_200, unit: 'tonne' } },
  },
];

export type PublicCuBatch4Failure = { status: 'NOT_VERIFIED'; id: string; mine: string; blockers: string[] };

function referenceValue(metal: PublicCuBatch4Metal, quantity: PublicCuBatch4Quantity): number | null {
  if (!(quantity.value > 0)) return null;
  if (metal === 'Zn') {
    return quantity.unit === 'tonne'
      ? quantity.value * TIER_PUBLIC_CU_COST_BATCH4_POLICY.supplementalPriceDeck.Zn.value
      : null;
  }
  if (metal === 'Pb') {
    return quantity.unit === 'tonne'
      ? quantity.value * TIER_PUBLIC_CU_COST_BATCH4_POLICY.supplementalPriceDeck.Pb.value
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

export function normalizePublicCuBatch4Observation(row: PublicCuBatch4Observation): PublicCuPilotNormalizedObservation | PublicCuBatch4Failure {
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
  for (const [metal, quantity] of Object.entries(row.productionByMetal ?? {}) as Array<[PublicCuBatch4Metal, PublicCuBatch4Quantity]>) {
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

export function buildBatch4PublicCuPilotCurve() {
  const prior = buildBatch3PublicCuPilotCurve();
  const supersededPartialIds = new Set(['new-afton-2024', 'zaldivar-2024']);
  const priorFailures = prior.failures.filter((row) => !supersededPartialIds.has(row.id));
  const batch4Results = PUBLIC_CU_COST_BATCH4_OBSERVATIONS.map(normalizePublicCuBatch4Observation);
  const batch4Normalized = batch4Results.filter((row): row is PublicCuPilotNormalizedObservation => row.status === 'NORMALIZED');
  const batch4Failures = batch4Results.filter((row): row is PublicCuBatch4Failure => row.status === 'NOT_VERIFIED');
  const normalized = [...prior.normalized, ...batch4Normalized];
  const failures = [...priorFailures, ...batch4Failures];
  const totalContainedCuTonnes = normalized.reduce((sum, row) => sum + row.copperContainedTonnes, 0);
  const ready = normalized.length >= TIER_PUBLIC_CU_COST_PILOT_POLICY.minimumEligibleObservationsForQuartiles;
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
    normalized,
    failures,
  };
}
