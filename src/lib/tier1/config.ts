export type Tier1Metal = 'Au' | 'Ag' | 'Cu' | 'Zn' | 'Pb' | 'Ni' | 'Pt' | 'Pd';
export type TierBand = 1 | 2 | 3;

export type Tier1ProductionThreshold = {
  metal: Tier1Metal;
  minimumAnnualPayable: number;
  unit: 'toz' | 'tonne';
  label: string;
};

export type Tier1CostMetric =
  | 'AISC_AU_USD_PER_TOZ'
  | 'AISC_AG_CO_PRODUCT_USD_PER_TOZ'
  | 'AISC_AGEQ_USD_PER_TOZ'
  | 'C1_CU_USD_PER_LB'
  | 'AISC_ZNEQ_USD_PER_LB'
  | 'C1_NI_USD_PER_LB'
  | 'AISC_NI_USD_PER_LB'
  | 'AISC_PGM3E_USD_PER_TOZ';

/** Exact cost-definition family required for benchmark compatibility. */
export type Tier1CostBasisId =
  | 'S_AND_P_CO_PRODUCT_AISC_AU'
  | 'S_AND_P_CO_PRODUCT_AISC_AG'
  | 'JUANICIPIO_REPORTED_AGEQ_AISC_MIXED_Q1_EVIDENCE'
  | 'S_AND_P_CO_PRODUCT_C1_CU'
  | 'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS'
  | 'JAGUAR_NI_C1_MINE_SITE_GA'
  | 'BMI_PAYABLE_NI_C1_BYPRODUCT_SALES'
  | 'VALTERRA_PGM_3E_AISC_SOLD';

/** All schema-supported cost metrics, including legacy evidence metrics that are not preferred benchmarks. */
export const TIER1_COST_METRIC_IDS: readonly Tier1CostMetric[] = [
  'AISC_AU_USD_PER_TOZ',
  'AISC_AG_CO_PRODUCT_USD_PER_TOZ',
  'AISC_AGEQ_USD_PER_TOZ',
  'C1_CU_USD_PER_LB',
  'AISC_ZNEQ_USD_PER_LB',
  'C1_NI_USD_PER_LB',
  'AISC_NI_USD_PER_LB',
  'AISC_PGM3E_USD_PER_TOZ',
];

/** All schema-supported cost bases. Validation must not depend only on the current preferred benchmark per metal. */
export const TIER1_COST_BASIS_IDS: readonly Tier1CostBasisId[] = [
  'S_AND_P_CO_PRODUCT_AISC_AU',
  'S_AND_P_CO_PRODUCT_AISC_AG',
  'JUANICIPIO_REPORTED_AGEQ_AISC_MIXED_Q1_EVIDENCE',
  'S_AND_P_CO_PRODUCT_C1_CU',
  'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS',
  'JAGUAR_NI_C1_MINE_SITE_GA',
  'BMI_PAYABLE_NI_C1_BYPRODUCT_SALES',
  'VALTERRA_PGM_3E_AISC_SOLD',
];

export type Tier1CostBenchmarkKind =
  | 'FULL_QUARTILE_CURVE'
  | 'EXACT_Q1_BOUNDARY'
  | 'Q1_REFERENCE_CEILING'
  | 'CURVE_IDENTIFIED_NO_BOUNDARIES';

export type Tier1CostBenchmark = {
  metal: Tier1Metal;
  metric: Tier1CostMetric;
  basisId: Tier1CostBasisId;
  /** False means the cited source is retained as evidence but may not classify Tier cost. */
  comparisonEnabled: boolean;
  benchmarkKind: Tier1CostBenchmarkKind;
  /**
   * Maximum cost for the first quartile / P25 boundary when verified. Null is
   * required when the curve is identified but the boundary itself has not yet
   * been extracted/verified; never substitute a peer asset or zero.
   */
  q1Max: number | null;
  /** P50 and P75 cost-curve boundaries. Null until definition-compatible values are verified. */
  p50Max: number | null;
  p75Max: number | null;
  /**
   * Absolute uncertainty around digitised percentile boundaries in benchmark
   * units. Published exact values use 0. A project inside an uncertainty band
   * must remain NOT_VERIFIED rather than being forced across a boundary.
   */
  boundaryUncertaintyAbs: number;
  unit: 'USD/toz' | 'USD/lb';
  updatedAtUtc: string;
  dataPeriod: string;
  sourceLabel: string;
  sourceUrl: string;
  /** Exact slide/page/table when the public evidence exposes one. Never inferred. */
  sourcePageOrTable?: string;
  evidenceUrl?: string;
  notes: string;
};

/**
 * Instrumentbrädan policy thresholds for sustained physical production scale.
 * They are deliberately price-independent and are not presented as universal
 * mining-industry definitions of “Tier 1”. Change only as an explicit policy
 * decision, never as a side effect of metal prices or an individual project.
 */
export const TIER1_PRODUCTION_THRESHOLDS: Record<Tier1Metal, Tier1ProductionThreshold> = {
  Au: { metal: 'Au', minimumAnnualPayable: 300_000, unit: 'toz', label: '300 koz Au/år' },
  Ag: { metal: 'Ag', minimumAnnualPayable: 15_000_000, unit: 'toz', label: '15 Moz Ag/år' },
  Cu: { metal: 'Cu', minimumAnnualPayable: 100_000, unit: 'tonne', label: '100 kt Cu/år' },
  Zn: { metal: 'Zn', minimumAnnualPayable: 150_000, unit: 'tonne', label: '150 kt Zn/år' },
  Pb: { metal: 'Pb', minimumAnnualPayable: 100_000, unit: 'tonne', label: '100 kt Pb/år' },
  Ni: { metal: 'Ni', minimumAnnualPayable: 40_000, unit: 'tonne', label: '40 kt Ni/år' },
  Pt: { metal: 'Pt', minimumAnnualPayable: 100_000, unit: 'toz', label: '100 koz Pt/år' },
  Pd: { metal: 'Pd', minimumAnnualPayable: 150_000, unit: 'toz', label: '150 koz Pd/år' },
};

/**
 * Preferred/current benchmark per metal. Historical exact-year snapshots live
 * in TIER1_COST_BENCHMARK_SNAPSHOTS below. No project cost is inflation-adjusted
 * implicitly to make it fit a different benchmark year.
 */
export const TIER1_COST_BENCHMARKS: Record<Tier1Metal, Tier1CostBenchmark> = {
  Au: {
    metal: 'Au', metric: 'AISC_AU_USD_PER_TOZ', basisId: 'S_AND_P_CO_PRODUCT_AISC_AU', comparisonEnabled: true,
    benchmarkKind: 'FULL_QUARTILE_CURVE', q1Max: 1_228, p50Max: 1_501, p75Max: 1_840, boundaryUncertaintyAbs: 0, unit: 'USD/toz',
    updatedAtUtc: '2026-08-28', dataPeriod: '2025E',
    sourceLabel: 'S&P Capital IQ / G2 Goldfields global gold AISC curve',
    sourceUrl: 'https://g2goldfields.com/wp-content/uploads/2026/03/G2-Goldfields-Investor-Presentation-March-2026-Public.pdf',
    sourcePageOrTable: 'slide 27',
    notes: '2025E global gold AISC curve, co-product basis, mines >25 koz Au. Publicerade kvartilband: Q1 <1 228; Q2 1 228–1 501; Q3 1 501–1 840; Q4 >1 840 USD/oz Au. Gränserna är explicit utskrivna i källan, därför boundaryUncertaintyAbs=0.',
  },
  Ag: {
    metal: 'Ag', metric: 'AISC_AG_CO_PRODUCT_USD_PER_TOZ', basisId: 'S_AND_P_CO_PRODUCT_AISC_AG', comparisonEnabled: false,
    benchmarkKind: 'CURVE_IDENTIFIED_NO_BOUNDARIES', q1Max: null, p50Max: null, p75Max: null, boundaryUncertaintyAbs: 0, unit: 'USD/toz',
    updatedAtUtc: '2026-08-28', dataPeriod: '2024 actual',
    sourceLabel: 'S&P Global Market Intelligence global co-product silver AISC curve / Sunshine Silver SEC filing',
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/2091017/000114036126013160/filename1.htm',
    notes: 'Global 2024 actual co-product silver AISC curve, excluding Russia and mines below 500 koz Ag. Co-product cost allocation is based on revenue-value split. The public source verifies the curve definition and that Sunshine base-case AISC 18.81 USD/oz is in Q2, but it does not print exact P25/P50/P75 values. Those boundaries therefore remain null and silver Cost Tier is fail-closed until they are independently extracted and assigned an explicit digitisation uncertainty.',
  },
  Cu: {
    metal: 'Cu', metric: 'C1_CU_USD_PER_LB', basisId: 'S_AND_P_CO_PRODUCT_C1_CU', comparisonEnabled: true,
    benchmarkKind: 'FULL_QUARTILE_CURVE', q1Max: 1.40, p50Max: 1.76, p75Max: 2.18, boundaryUncertaintyAbs: 0.05, unit: 'USD/lb',
    updatedAtUtc: '2026-08-28', dataPeriod: '2024 actual (Q4 2024 dataset)',
    sourceLabel: 'S&P Global Market Intelligence / Ivanhoe Electric Santa Cruz PFS global copper C1 curve',
    sourceUrl: 'https://ivanhoeelectric.com/site/assets/files/10951/sc_pfs_investor_presentation_vfinal_v2.pdf',
    sourcePageOrTable: 'slide 10, First Quartile Unit Cash Costs',
    evidenceUrl: 'https://ivanhoeelectric.com/news/ivanhoe-electrics-preliminary-feasibility-study-for-the-santa-cruz-copper-project-in-arizona-defines-a-high-quality-underground/',
    notes: 'S&P Global Market Intelligence 2024 actual C1 cash operating cost curve on a co-product basis for global copper mines, excluding processing facilities. P25≈1.40, P50≈1.76 and P75≈2.18 USD/lb are digitised from the plotted curve, not published tabular values; boundaryUncertaintyAbs=0.05 USD/lb prevents classification inside the read-off uncertainty bands. Ivanhoe separately states that Santa Cruz C1 1.32 USD/lb is global first quartile against the Q4 2024 S&P dataset; 1.32 is therefore an independent Q1 sanity check, not the P25 value.',
  },
  Zn: {
    metal: 'Zn', metric: 'AISC_ZNEQ_USD_PER_LB', basisId: 'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS', comparisonEnabled: false,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 0.16, p50Max: null, p75Max: null, boundaryUncertaintyAbs: 0, unit: 'USD/lb',
    updatedAtUtc: '2026-08-27', dataPeriod: '2024 FS / investment approval', sourceLabel: 'South32 Hermosa Taylor FS',
    sourceUrl: 'https://www.south32.net/docs/default-source/exchange-releases/final-investment-approval-to-develop-hermosa-taylor-deposit-0x5ffd9fac3b216589.pdf',
    notes: 'Taylor ~0,16 USD/lb är Zn AISC net of Pb/Ag credits, inklusive TCRCs och sustaining capital. Det är inte ZnEq AISC. Nuvarande AISC_ZNEQ-metrik ska ersättas/kompletteras med en definitionskompatibel Zn cost-curve basis innan klassificering aktiveras.',
  },
  Pb: {
    metal: 'Pb', metric: 'AISC_ZNEQ_USD_PER_LB', basisId: 'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS', comparisonEnabled: false,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 0.16, p50Max: null, p75Max: null, boundaryUncertaintyAbs: 0, unit: 'USD/lb',
    updatedAtUtc: '2026-08-27', dataPeriod: '2024 FS / investment approval', sourceLabel: 'South32 Hermosa Taylor FS',
    sourceUrl: 'https://www.south32.net/docs/default-source/exchange-releases/final-investment-approval-to-develop-hermosa-taylor-deposit-0x5ffd9fac3b216589.pdf',
    notes: 'Taylor-referensen är uttryckligen Zn AISC net of Pb/Ag credits, inte en fristående Pb- eller ZnEq-kvartilgräns. Pb behöver en egen definitionskompatibel cost curve innan klassificering aktiveras.',
  },
  Ni: {
    metal: 'Ni', metric: 'C1_NI_USD_PER_LB', basisId: 'JAGUAR_NI_C1_MINE_SITE_GA', comparisonEnabled: true,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 3.34, p50Max: null, p75Max: null, boundaryUncertaintyAbs: 0, unit: 'USD/lb',
    updatedAtUtc: '2026-08-28', dataPeriod: '2025 JVEP / Annual Report 2025', sourceLabel: 'Centaurus Metals Jaguar JVEP / Annual Report 2025',
    sourceUrl: 'https://centaurusmetals.com/PDF/0c610073-19a9-4383-b302-aca60cfa61ad/AnnualReporttoshareholders',
    evidenceUrl: 'https://centaurusmetals.com/PDF/3c949469-bb3f-4761-a55a-54034f831ab2/JaguarValueEngineeringEnhancesProjectEconomics',
    notes: 'Jaguar redovisas uttryckligen i första kvartilen och 3,34 USD/lb på payable Ni basis. Detta är en Q1-referens, inte en full P25/P50/P75-kurva. En full nickelkurva måste använda samma by-product/co-product-definition innan Tier 2/3 kan klassificeras.',
  },
  Pt: {
    metal: 'Pt', metric: 'AISC_PGM3E_USD_PER_TOZ', basisId: 'VALTERRA_PGM_3E_AISC_SOLD', comparisonEnabled: true,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 835, p50Max: null, p75Max: null, boundaryUncertaintyAbs: 0, unit: 'USD/toz',
    updatedAtUtc: '2026-08-28', dataPeriod: '2025', sourceLabel: 'Valterra Platinum Mogalakwena 2025',
    sourceUrl: 'https://www.valterraplatinum.com/media_centre/annual-results-2025/',
    evidenceUrl: 'https://www.valterraplatinum.com/~/media/Files/V/Valterra-Platinum/Platinum/report-archive/2025/integrated-report-2025.pdf',
    notes: 'Mogalakwena 2025 AISC 835 USD per såld 3E oz och uttryckligen första kvartilen. Referensen är pass-only; P50/P75 saknas på samma 3E AISC-sold basis.',
  },
  Pd: {
    metal: 'Pd', metric: 'AISC_PGM3E_USD_PER_TOZ', basisId: 'VALTERRA_PGM_3E_AISC_SOLD', comparisonEnabled: true,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 835, p50Max: null, p75Max: null, boundaryUncertaintyAbs: 0, unit: 'USD/toz',
    updatedAtUtc: '2026-08-28', dataPeriod: '2025', sourceLabel: 'Valterra Platinum Mogalakwena 2025',
    sourceUrl: 'https://www.valterraplatinum.com/media_centre/annual-results-2025/',
    evidenceUrl: 'https://www.valterraplatinum.com/~/media/Files/V/Valterra-Platinum/Platinum/report-archive/2025/integrated-report-2025.pdf',
    notes: 'Mogalakwena 2025 AISC 835 USD per såld 3E oz och uttryckligen första kvartilen. Referensen är pass-only; P50/P75 saknas på samma 3E AISC-sold basis.',
  },
};

/**
 * Full Nickel C1 curve retained as a second, definition-locked 2025 snapshot.
 * The preferred Jaguar bridge remains available for projects that report that
 * exact basis; no implicit conversion between the two Ni definitions is made.
 */
export const TIER1_NI_BMI_2025_COST_BENCHMARK: Tier1CostBenchmark = {
  metal: 'Ni',
  metric: 'C1_NI_USD_PER_LB',
  basisId: 'BMI_PAYABLE_NI_C1_BYPRODUCT_SALES',
  comparisonEnabled: true,
  benchmarkKind: 'FULL_QUARTILE_CURVE',
  q1Max: 4.95,
  p50Max: 6.45,
  p75Max: 6.95,
  boundaryUncertaintyAbs: 0.15,
  unit: 'USD/lb',
  updatedAtUtc: '2026-08-28',
  dataPeriod: '2025 forecast (BMI Q2 2025)',
  sourceLabel: 'Benchmark Mineral Intelligence Nickel Forecast Q2 2025 / The Metals Company',
  sourceUrl: 'https://investors.metals.co/static-files/f36f6850-3baa-4591-a902-dc3c884391e6',
  sourcePageOrTable: 'slide 17, Nickel C1 Cost Curve 2025',
  notes: 'BMI-kurvan är korrigerad för payable metal med BMI-metodik och kostnaderna inkluderar by-product sales. P25≈4,95, P50≈6,45 och P75≈6,95 USD/lb är digitaliserade från diagrammet (ungefär 10,9/14,2/15,3 kUSD/t Ni), inte publicerade tabellvärden. boundaryUncertaintyAbs=0,15 USD/lb gör bedömningen fail-closed nära P25/P50. TMC:s markerade 1 065 USD/t C1 har lagts till av TMC och är inte ett BMI-estimat.',
};

/**
 * Exact-year benchmark registry. Add a historical snapshot only when its
 * percentile values, metric, basis and cost year are independently verified.
 * Current entries seed the registry; no synthetic inflation backcasts exist.
 */
export const TIER1_COST_BENCHMARK_SNAPSHOTS: Record<Tier1Metal, Tier1CostBenchmark[]> = {
  Au: [TIER1_COST_BENCHMARKS.Au],
  Ag: [TIER1_COST_BENCHMARKS.Ag],
  Cu: [TIER1_COST_BENCHMARKS.Cu],
  Zn: [TIER1_COST_BENCHMARKS.Zn],
  Pb: [TIER1_COST_BENCHMARKS.Pb],
  Ni: [TIER1_COST_BENCHMARKS.Ni, TIER1_NI_BMI_2025_COST_BENCHMARK],
  Pt: [TIER1_COST_BENCHMARKS.Pt],
  Pd: [TIER1_COST_BENCHMARKS.Pd],
};

export const TIER1_POLICY = {
  tier1LomYears: 15,
  tier2LomYears: 10,
  tier1AfterTaxIrr: 0.25,
  tier2AfterTaxIrr: 0.20,
  minimumQualifiedAfterTaxIrr: 0.15,
  tier1ScaleEquivalent: 1.0,
  tier2ScaleEquivalent: 0.40,
  sustainedScaleYears: 10,
  cycleLookbackYears: 25,
  cycleTrendMonths: 60,
  cycleRollingMonths: 12,
  cycleBearThresholdRatio: 0.95,
  cycleMinimumEpisodeMonths: 6,
  cycleEpisodeTroughQuantile: 0.50,
  cycleDurationProductionPeriods: 3,
  costBenchmarkMaxAgeDays: 365,
  minimumHistoryMonths: 180,
  goldCostDominanceMinimumRevenueShare: 0.80,
} as const;

export function tierBandFromScaleEquivalent(value: number): TierBand {
  if (value >= TIER1_POLICY.tier1ScaleEquivalent) return 1;
  if (value >= TIER1_POLICY.tier2ScaleEquivalent) return 2;
  return 3;
}

export function tierBandFromLom(value: number): TierBand {
  if (value >= TIER1_POLICY.tier1LomYears) return 1;
  if (value >= TIER1_POLICY.tier2LomYears) return 2;
  return 3;
}

export function tierBandFromIrr(value: number): TierBand | null {
  if (value >= TIER1_POLICY.tier1AfterTaxIrr) return 1;
  if (value >= TIER1_POLICY.tier2AfterTaxIrr) return 2;
  if (value >= TIER1_POLICY.minimumQualifiedAfterTaxIrr) return 3;
  return null;
}

export function isTier1Metal(value: string): value is Tier1Metal {
  return value in TIER1_PRODUCTION_THRESHOLDS;
}

export function costBenchmarkDataYear(dataPeriod: string): number | null {
  const match = String(dataPeriod ?? '').match(/(?:19|20)[0-9]{2}/);
  return match ? Number(match[0]) : null;
}

export function getCompatibleTier1CostBenchmark(args: {
  metal: Tier1Metal;
  metric: Tier1CostMetric;
  basisId: Tier1CostBasisId;
  costBaseYear: number;
}): Tier1CostBenchmark | null {
  const matches = TIER1_COST_BENCHMARK_SNAPSHOTS[args.metal].filter((benchmark) =>
    benchmark.metric === args.metric
    && benchmark.basisId === args.basisId
    && costBenchmarkDataYear(benchmark.dataPeriod) === args.costBaseYear,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function ageInDays(asOfUtc: string, nowUtc: string): number | null {
  const asOf = new Date(`${asOfUtc.slice(0, 10)}T00:00:00Z`).getTime();
  const now = new Date(`${nowUtc.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(asOf) || !Number.isFinite(now)) return null;
  return Math.floor((now - asOf) / 86_400_000);
}

export function tier1CostBenchmarkNeedsUpdate(benchmark: Tier1CostBenchmark, nowUtc = new Date().toISOString()): boolean {
  const age = ageInDays(benchmark.updatedAtUtc, nowUtc);
  return age !== null && age >= TIER1_POLICY.costBenchmarkMaxAgeDays;
}

export function getTier1CostBenchmarkTodos(nowUtc = new Date().toISOString()): string[] {
  return Object.values(TIER1_COST_BENCHMARKS)
    .filter((benchmark) => tier1CostBenchmarkNeedsUpdate(benchmark, nowUtc))
    .map((benchmark) => `Tier: uppdatera statisk kostnadskurva för ${benchmark.metal} (senast verifierad ${benchmark.updatedAtUtc}; data ${benchmark.dataPeriod}).`);
}
