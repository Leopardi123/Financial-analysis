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

export type Tier1CostBenchmarkKind = 'EXACT_Q1_BOUNDARY' | 'Q1_REFERENCE_CEILING';

export type Tier1CostBenchmark = {
  metal: Tier1Metal;
  metric: Tier1CostMetric;
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
 * as a true Q1 pass/fail boundary when the project metric is definition-compatible.
 * Q1_REFERENCE_CEILING is pass-only: above the cited first-quartile mine is unknown,
 * never an inferred FAIL.
 */
export const TIER1_COST_BENCHMARKS: Record<Tier1Metal, Tier1CostBenchmark> = {
  Au: {
    metal: 'Au', metric: 'AISC_AU_USD_PER_TOZ', benchmarkKind: 'EXACT_Q1_BOUNDARY', q1Max: 1_228, unit: 'USD/toz',
    updatedAtUtc: '2026-08-27', dataPeriod: '2025E',
    sourceLabel: 'S&P Capital IQ / G2 Goldfields global gold AISC curve',
    sourceUrl: 'https://g2goldfields.com/wp-content/uploads/2026/03/G2-Goldfields-Investor-Presentation-March-2026-Public.pdf',
    notes: 'Publicerad 2025E-gräns: första kvartilen <1 228 USD/oz Au. Globalt urval av guldgruvor över 25 koz; co-product AISC.',
  },
  Ag: {
    metal: 'Ag', metric: 'AISC_AGEQ_USD_PER_TOZ', benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 12.9, unit: 'USD/toz',
    updatedAtUtc: '2026-08-27', dataPeriod: '2025',
    sourceLabel: 'Juanicipio 2025 AgEq AISC; Pan American/S&P first-quartile classification',
    sourceUrl: 'https://www.fresnilloplc.com/media/wfzesgc1/030326-fres-fy25-prelim-presentation-final.pdf',
    evidenceUrl: 'https://panamericansilver.com/wp-content/uploads/2026/06/PAAS-Investor-Presentation_June_2026_vF.pdf',
    notes: 'Juanicipio redovisade 2025 AISC på 12,9 USD/AgEq oz och klassificeras i första kostnadskvartilen. Konservativ pass-only-referens; ingen exakt Q1/Q2-gräns antas.',
  },
  Cu: {
    metal: 'Cu', metric: 'C1_CU_USD_PER_LB', benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 1.32, unit: 'USD/lb',
    updatedAtUtc: '2026-08-27', dataPeriod: '2025 PFS', sourceLabel: 'Ivanhoe Electric Santa Cruz PFS',
    sourceUrl: 'https://ivanhoeelectric.com/news/ivanhoe-electrics-preliminary-feasibility-study-for-the-santa-cruz-copper-project-in-arizona-defines-a-high-quality-underground/',
    notes: 'Santa Cruz LOM C1 cash cost 1,32 USD/lb Cu och uttryckligen första globala kostnadskvartilen. Konservativ pass-only-referens.',
  },
  Zn: {
    metal: 'Zn', metric: 'AISC_ZNEQ_USD_PER_LB', benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 0.16, unit: 'USD/lb',
    updatedAtUtc: '2026-08-27', dataPeriod: 'Taylor FS / 2024 investment approval', sourceLabel: 'South32 Hermosa Taylor FS',
    sourceUrl: 'https://www.south32.net/docs/default-source/exchange-releases/final-investment-approval-to-develop-hermosa-taylor-deposit-0x5ffd9fac3b216589.pdf',
    notes: 'Taylor Zn-Pb-Ag AISC cirka 0,16 USD/lb ZnEq och uttryckligen första kostnadskvartilen. Basket-referens och endast pass-only.',
  },
  Pb: {
    metal: 'Pb', metric: 'AISC_ZNEQ_USD_PER_LB', benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 0.16, unit: 'USD/lb',
    updatedAtUtc: '2026-08-27', dataPeriod: 'Taylor FS / 2024 investment approval', sourceLabel: 'South32 Hermosa Taylor FS',
    sourceUrl: 'https://www.south32.net/docs/default-source/exchange-releases/final-investment-approval-to-develop-hermosa-taylor-deposit-0x5ffd9fac3b216589.pdf',
    notes: 'Taylor Zn-Pb-Ag AISC cirka 0,16 USD/lb ZnEq och uttryckligen första kostnadskvartilen. Basket-referens; behandlas aldrig som en fristående Pb-kvartilgräns.',
  },
  Ni: {
    metal: 'Ni', metric: 'C1_NI_USD_PER_LB', benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 3.34, unit: 'USD/lb',
    updatedAtUtc: '2026-08-27', dataPeriod: '2025 project update', sourceLabel: 'Centaurus Metals Jaguar nickel project',
    sourceUrl: 'https://centaurusmetals.com/pdf/b2bc4fc8-f0c0-4704-8d19-6cb756e7a057/Quarterly-ActivitiesAppendix-5B-Cash-Flow-Report.pdf?Platform=ListPage',
    notes: 'Jaguar LOM C1 3,34 USD/lb payable Ni och uttryckligen första kostnadskvartilen. Konservativ pass-only-referens.',
  },
  Pt: {
    metal: 'Pt', metric: 'AISC_PGM3E_USD_PER_TOZ', benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 835, unit: 'USD/toz',
    updatedAtUtc: '2026-08-27', dataPeriod: '2025', sourceLabel: 'Valterra Platinum Mogalakwena 2025',
    sourceUrl: 'https://www.valterraplatinum.com/media_centre/annual-results-2025/',
    notes: 'Mogalakwena AISC 835 USD per såld 3E oz och uttryckligen första kostnadskvartilen. PGM-basketreferens och endast pass-only.',
  },
  Pd: {
    metal: 'Pd', metric: 'AISC_PGM3E_USD_PER_TOZ', benchmarkKind: 'Q1_REFERENCE_CEILING', q1Max: 835, unit: 'USD/toz',
    updatedAtUtc: '2026-08-27', dataPeriod: '2025', sourceLabel: 'Valterra Platinum Mogalakwena 2025',
    sourceUrl: 'https://www.valterraplatinum.com/media_centre/annual-results-2025/',
    notes: 'Mogalakwena AISC 835 USD per såld 3E oz och uttryckligen första kostnadskvartilen. PGM-basketreferens och endast pass-only.',
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