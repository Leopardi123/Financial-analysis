export type Tier1Metal = 'Au' | 'Ag' | 'Cu' | 'Zn' | 'Pb' | 'Ni' | 'Pt' | 'Pd';

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

/**
 * Trial Tier-1 physical scale gates. A polymetallic project may also pass through
 * the combined threshold-equivalent fallback in the assessment layer.
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
 * Static, manually updateable low-cost evidence for every metal in the current
 * Tier-1 universe. updatedAtUtc is the date the registry was manually verified;
 * the underlying data period is retained separately.
 *
 * EXACT_Q1_BOUNDARY may be used as a true pass/fail boundary when the project
 * metric is definition-compatible. Q1_REFERENCE_CEILING is deliberately more
 * conservative: the cited mine is explicitly described as first-quartile and
 * its published cost is stored as a pass-only ceiling. A project above such a
 * reference is NOT_VERIFIED, never failed, because the true 25th-percentile
 * boundary is not public.
 */
export const TIER1_COST_BENCHMARKS: Record<Tier1Metal, Tier1CostBenchmark> = {
  Au: {
    metal: 'Au',
    metric: 'AISC_AU_USD_PER_TOZ',
    benchmarkKind: 'EXACT_Q1_BOUNDARY',
    q1Max: 1_228,
    unit: 'USD/toz',
    updatedAtUtc: '2026-08-27',
    dataPeriod: '2025E',
    sourceLabel: 'S&P Capital IQ / G2 Goldfields global gold AISC curve',
    sourceUrl: 'https://g2goldfields.com/wp-content/uploads/2026/03/G2-Goldfields-Investor-Presentation-March-2026-Public.pdf',
    notes: 'Explicit 2025E boundary: first quartile < US$1,228/oz Au. Global gold mines >25 koz; co-product AISC.',
  },
  Ag: {
    metal: 'Ag',
    metric: 'AISC_AGEQ_USD_PER_TOZ',
    benchmarkKind: 'Q1_REFERENCE_CEILING',
    q1Max: 12.9,
    unit: 'USD/toz',
    updatedAtUtc: '2026-08-27',
    dataPeriod: '2025',
    sourceLabel: 'Juanicipio 2025 AgEq AISC; Pan American/S&P first-quartile classification',
    sourceUrl: 'https://www.fresnilloplc.com/media/wfzesgc1/030326-fres-fy25-prelim-presentation-final.pdf',
    evidenceUrl: 'https://panamericansilver.com/wp-content/uploads/2026/06/PAAS-Investor-Presentation_June_2026_vF.pdf',
    notes: 'Juanicipio 2025 AISC US$12.9/AgEq oz. Pan American’s 2026 S&P-based cost curve explicitly classifies Juanicipio as a first-quartile silver asset. This is a conservative pass-only reference, not the exact Q25 boundary.',
  },
  Cu: {
    metal: 'Cu',
    metric: 'C1_CU_USD_PER_LB',
    benchmarkKind: 'Q1_REFERENCE_CEILING',
    q1Max: 1.32,
    unit: 'USD/lb',
    updatedAtUtc: '2026-08-27',
    dataPeriod: '2025 PFS',
    sourceLabel: 'Ivanhoe Electric Santa Cruz PFS',
    sourceUrl: 'https://ivanhoeelectric.com/news/ivanhoe-electrics-preliminary-feasibility-study-for-the-santa-cruz-copper-project-in-arizona-defines-a-high-quality-underground/',
    notes: 'Santa Cruz LOM C1 cash cost US$1.32/lb Cu, explicitly described as global first quartile. Conservative pass-only reference, not the exact global Q25 boundary.',
  },
  Zn: {
    metal: 'Zn',
    metric: 'AISC_ZNEQ_USD_PER_LB',
    benchmarkKind: 'Q1_REFERENCE_CEILING',
    q1Max: 0.16,
    unit: 'USD/lb',
    updatedAtUtc: '2026-08-27',
    dataPeriod: 'Taylor FS / 2024 investment approval',
    sourceLabel: 'South32 Hermosa Taylor FS',
    sourceUrl: 'https://www.south32.net/docs/default-source/exchange-releases/final-investment-approval-to-develop-hermosa-taylor-deposit-0x5ffd9fac3b216589.pdf',
    notes: 'Taylor Zn-Pb-Ag AISC ~US$0.16/lb on a ZnEq basis and explicitly first quartile. Shared Zn/Pb polymetallic reference; not a standalone zinc Q25 boundary.',
  },
  Pb: {
    metal: 'Pb',
    metric: 'AISC_ZNEQ_USD_PER_LB',
    benchmarkKind: 'Q1_REFERENCE_CEILING',
    q1Max: 0.16,
    unit: 'USD/lb',
    updatedAtUtc: '2026-08-27',
    dataPeriod: 'Taylor FS / 2024 investment approval',
    sourceLabel: 'South32 Hermosa Taylor FS',
    sourceUrl: 'https://www.south32.net/docs/default-source/exchange-releases/final-investment-approval-to-develop-hermosa-taylor-deposit-0x5ffd9fac3b216589.pdf',
    notes: 'Taylor Zn-Pb-Ag AISC ~US$0.16/lb on a ZnEq basis and explicitly first quartile. Used only as a shared Zn/Pb basket reference, never as a standalone Pb Q25 boundary.',
  },
  Ni: {
    metal: 'Ni',
    metric: 'C1_NI_USD_PER_LB',
    benchmarkKind: 'Q1_REFERENCE_CEILING',
    q1Max: 3.34,
    unit: 'USD/lb',
    updatedAtUtc: '2026-08-27',
    dataPeriod: '2025 project update',
    sourceLabel: 'Centaurus Metals Jaguar nickel project',
    sourceUrl: 'https://centaurusmetals.com/pdf/b2bc4fc8-f0c0-4704-8d19-6cb756e7a057/Quarterly-ActivitiesAppendix-5B-Cash-Flow-Report.pdf?Platform=ListPage',
    notes: 'Jaguar LOM C1 US$3.34/lb payable Ni and AISC US$4.43/lb, both explicitly described as first quartile. C1 is stored as the conservative reference because nickel cost curves are normally C1-based.',
  },
  Pt: {
    metal: 'Pt',
    metric: 'AISC_PGM3E_USD_PER_TOZ',
    benchmarkKind: 'Q1_REFERENCE_CEILING',
    q1Max: 835,
    unit: 'USD/toz',
    updatedAtUtc: '2026-08-27',
    dataPeriod: '2025',
    sourceLabel: 'Valterra Platinum Mogalakwena 2025',
    sourceUrl: 'https://www.valterraplatinum.com/media_centre/annual-results-2025/',
    notes: 'Mogalakwena AISC US$835 per 3E oz sold and explicitly described as firmly first quartile. PGM basket reference only; not a standalone Pt cost curve.',
  },
  Pd: {
    metal: 'Pd',
    metric: 'AISC_PGM3E_USD_PER_TOZ',
    benchmarkKind: 'Q1_REFERENCE_CEILING',
    q1Max: 835,
    unit: 'USD/toz',
    updatedAtUtc: '2026-08-27',
    dataPeriod: '2025',
    sourceLabel: 'Valterra Platinum Mogalakwena 2025',
    sourceUrl: 'https://www.valterraplatinum.com/media_centre/annual-results-2025/',
    notes: 'Mogalakwena AISC US$835 per 3E oz sold and explicitly described as firmly first quartile. PGM basket reference only; not a standalone Pd cost curve.',
  },
};

export const TIER1_POLICY = {
  minimumLomYears: 15,
  minimumAfterTaxIrr: 0.25,
  cycleLookbackYears: 25,
  cycleTrendMonths: 60,
  cyclePercentile: 0.20,
  cycleDurationProductionPeriods: 3,
  costBenchmarkMaxAgeDays: 365,
  minimumHistoryMonths: 180,
  goldCostDominanceMinimumRevenueShare: 0.80,
  minimumCombinedScaleEquivalent: 1.0,
} as const;

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
    .map((benchmark) => `Tier-1: uppdatera statisk Q1-kostnadsreferens för ${benchmark.metal} (senast verifierad ${benchmark.updatedAtUtc}; data ${benchmark.dataPeriod}).`);
}
