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
  | 'AISC_AGEQ_USD_PER_TOZ'
  | 'C1_CU_USD_PER_LB'
  | 'AISC_ZNEQ_USD_PER_LB'
  | 'C1_NI_USD_PER_LB'
  | 'AISC_NI_USD_PER_LB'
  | 'AISC_PGM3E_USD_PER_TOZ';

/** Exact cost-definition family required for benchmark compatibility. */
export type Tier1CostBasisId =
  | 'S_AND_P_CO_PRODUCT_AISC_AU'
  | 'JUANICIPIO_REPORTED_AGEQ_AISC_MIXED_Q1_EVIDENCE'
  | 'S_AND_P_CO_PRODUCT_C1_CU'
  | 'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS'
  | 'JAGUAR_NI_C1_MINE_SITE_GA'
  | 'VALTERRA_PGM_3E_AISC_SOLD';

export type Tier1CostBenchmarkKind = 'EXACT_Q1_BOUNDARY' | 'Q1_REFERENCE_CEILING';

export type Tier1CostBenchmark = {
  metal: Tier1Metal;
  metric: Tier1CostMetric;
  basisId: Tier1CostBasisId;
  /** False means the cited value is retained as evidence but may not classify Tier cost. */
  comparisonEnabled: boolean;
  benchmarkKind: Tier1CostBenchmarkKind;
  q1Max: number;
  unit: 'USD/toz' | 'USD/lb';
  updatedAtUtc: string;
  dataPeriod: string;
  sourceLabel: string;
  sourceUrl: string;
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
 * Static, manually updateable low-cost evidence. EXACT_Q1_BOUNDARY may be used
 * as a true Q1 pass/fail boundary only when metric, basis and cost vintage are
 * definition-compatible. Q1_REFERENCE_CEILING is pass-only: above a cited
 * first-quartile asset is unknown, never an inferred FAIL.
 */
export const TIER1_COST_BENCHMARKS: Record<Tier1Metal, Tier1CostBenchmark> = {
  Au: {
    metal: 'Au', metric: 'AISC_AU_USD_PER_TOZ', basisId: 'S_AND_P_CO_PRODUCT_AISC_AU', comparisonEnabled: true,
    benchmarkKind: 'EXACT_Q1_BOUNDARY', q1Max: 1_228, unit: 'USD/toz',
    updatedAtUtc: '2026-08-27', dataPeriod: '2025E',
    sourceLabel: 'S&P Capital IQ / G2 Goldfields global gold AISC curve',
    sourceUrl: 'https://g2goldfields.com/wp-content/uploads/2026/03/G2-Goldfields-Investor-Presentation-March-2026-Public.pdf',
    notes: 'Publicerad 2025E Q1-gräns <1 228 USD/oz Au. Global mines >25 koz; S&P AISC på co-product basis. Endast co-product-kompatibel Au AISC får jämföras.',
  },
  Ag: {
    metal: 'Ag', metric: 'AISC_AGEQ_USD_PER_TOZ', basisId: 'JUANICIPIO_REPORTED_AGEQ_AISC_MIXED_Q1_EVIDENCE', comparisonEnabled: false,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 12.9, unit: 'USD/toz',
    updatedAtUtc: '2026-08-27', dataPeriod: '2025',
    sourceLabel: 'Juanicipio reported AgEq AISC + Pan American/S&P first-quartile evidence',
    sourceUrl: 'https://www.fresnilloplc.com/media/wfzesgc1/030326-fres-fy25-prelim-presentation-final.pdf',
    evidenceUrl: 'https://panamericansilver.com/wp-content/uploads/2026/06/PAAS-Investor-Presentation_June_2026_vF.pdf',
    notes: '12,9 USD/AgEq oz är ett rapporterat Juanicipio-mått, medan Pan Americans Q1-kostnadskurva uttryckligen använder S&P modellerad co-product AISC. Definitionerna är inte samma; referensen visas men får inte klassificera förrän en homogen Ag-benchmark finns.',
  },
  Cu: {
    metal: 'Cu', metric: 'C1_CU_USD_PER_LB', basisId: 'S_AND_P_CO_PRODUCT_C1_CU', comparisonEnabled: true,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 1.32, unit: 'USD/lb',
    updatedAtUtc: '2026-08-27', dataPeriod: '2025 PFS', sourceLabel: 'Ivanhoe Electric Santa Cruz PFS / S&P co-product C1 curve',
    sourceUrl: 'https://ivanhoeelectric.com/news/ivanhoe-electrics-preliminary-feasibility-study-for-the-santa-cruz-copper-project-in-arizona-defines-a-high-quality-underground/',
    notes: 'Santa Cruz LOM C1 1,32 USD/lb jämförs av Ivanhoe uttryckligen mot S&P Global Market Intelligence co-product C1 copper cash cost curve. Santa Cruz-tabellen visar C1 som mining + processing + G&A för single-product cathode. Polymetallisk Cu kräver verifierad co-product-allokering eller kompatibelt rapporterat C1.',
  },
  Zn: {
    metal: 'Zn', metric: 'AISC_ZNEQ_USD_PER_LB', basisId: 'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS', comparisonEnabled: false,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 0.16, unit: 'USD/lb',
    updatedAtUtc: '2026-08-27', dataPeriod: '2024 FS / investment approval', sourceLabel: 'South32 Hermosa Taylor FS',
    sourceUrl: 'https://www.south32.net/docs/default-source/exchange-releases/final-investment-approval-to-develop-hermosa-taylor-deposit-0x5ffd9fac3b216589.pdf',
    notes: 'Taylor ~0,16 USD/lb är Zn AISC net of Pb/Ag credits, inklusive TCRCs och sustaining capital. Det är inte ZnEq AISC. Nuvarande AISC_ZNEQ-metrik får därför inte jämföras mot denna referens.',
  },
  Pb: {
    metal: 'Pb', metric: 'AISC_ZNEQ_USD_PER_LB', basisId: 'TAYLOR_ZN_AISC_NET_PB_AG_CREDITS', comparisonEnabled: false,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 0.16, unit: 'USD/lb',
    updatedAtUtc: '2026-08-27', dataPeriod: '2024 FS / investment approval', sourceLabel: 'South32 Hermosa Taylor FS',
    sourceUrl: 'https://www.south32.net/docs/default-source/exchange-releases/final-investment-approval-to-develop-hermosa-taylor-deposit-0x5ffd9fac3b216589.pdf',
    notes: 'Taylor-referensen är uttryckligen Zn AISC net of Pb/Ag credits, inte en fristående Pb- eller ZnEq-kvartilgräns. Behålls som evidens men klassificering är avstängd.',
  },
  Ni: {
    metal: 'Ni', metric: 'C1_NI_USD_PER_LB', basisId: 'JAGUAR_NI_C1_MINE_SITE_GA', comparisonEnabled: true,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 3.34, unit: 'USD/lb',
    updatedAtUtc: '2026-08-28', dataPeriod: '2025 JVEP / Annual Report 2025', sourceLabel: 'Centaurus Metals Jaguar JVEP / Annual Report 2025',
    sourceUrl: 'https://centaurusmetals.com/PDF/0c610073-19a9-4383-b302-aca60cfa61ad/AnnualReporttoshareholders',
    evidenceUrl: 'https://centaurusmetals.com/PDF/3c949469-bb3f-4761-a55a-54034f831ab2/JaguarValueEngineeringEnhancesProjectEconomics',
    notes: 'Jaguar redovisas uttryckligen i första kvartilen. JVEP-bryggan visar mine-site C1 = mining + processing + G&A: 2,67 USD/lb nickel in concentrate/contained basis. Årsrapporten redovisar motsvarande första-kvartil C1 som 3,34 USD/lb på payable nickel basis. Tier-benchmarken använder 3,34 eftersom C1_NI-denominatorn är payable Ni; logistik, royalties, by-product credit och sustaining/deferred capital ligger utanför C1.',
  },
  Pt: {
    metal: 'Pt', metric: 'AISC_PGM3E_USD_PER_TOZ', basisId: 'VALTERRA_PGM_3E_AISC_SOLD', comparisonEnabled: true,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 835, unit: 'USD/toz',
    updatedAtUtc: '2026-08-28', dataPeriod: '2025', sourceLabel: 'Valterra Platinum Mogalakwena 2025',
    sourceUrl: 'https://www.valterraplatinum.com/media_centre/annual-results-2025/',
    evidenceUrl: 'https://www.valterraplatinum.com/~/media/Files/V/Valterra-Platinum/Platinum/report-archive/2025/integrated-report-2025.pdf',
    notes: 'Mogalakwena 2025 AISC 835 USD per såld 3E oz. Valterras Integrated Report 2025 anger uttryckligen att detta placerar Mogalakwena tydligt i första kvartilen av industry cost curve. PGM-basketreferens och endast pass-only; endast kompatibelt 3E-oz-sold AISC får jämföras.',
  },
  Pd: {
    metal: 'Pd', metric: 'AISC_PGM3E_USD_PER_TOZ', basisId: 'VALTERRA_PGM_3E_AISC_SOLD', comparisonEnabled: true,
    benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 835, unit: 'USD/toz',
    updatedAtUtc: '2026-08-28', dataPeriod: '2025', sourceLabel: 'Valterra Platinum Mogalakwena 2025',
    sourceUrl: 'https://www.valterraplatinum.com/media_centre/annual-results-2025/',
    evidenceUrl: 'https://www.valterraplatinum.com/~/media/Files/V/Valterra-Platinum/Platinum/report-archive/2025/integrated-report-2025.pdf',
    notes: 'Mogalakwena 2025 AISC 835 USD per såld 3E oz. Valterras Integrated Report 2025 anger uttryckligen att detta placerar Mogalakwena tydligt i första kvartilen av industry cost curve. PGM-basketreferens och endast pass-only; endast kompatibelt 3E-oz-sold AISC får jämföras.',
  },
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
    .map((benchmark) => `Tier: uppdatera statisk Q1-kostnadsreferens för ${benchmark.metal} (senast verifierad ${benchmark.updatedAtUtc}; data ${benchmark.dataPeriod}).`);
}
