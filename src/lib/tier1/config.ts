export type Tier1Metal = 'Au' | 'Ag' | 'Cu' | 'Zn' | 'Pb' | 'Ni' | 'Pt' | 'Pd';

export type Tier1ProductionThreshold = {
  metal: Tier1Metal;
  minimumAnnualPayable: number;
  unit: 'toz' | 'tonne';
  label: string;
};

export type Tier1CostBenchmark = {
  metal: Tier1Metal;
  metric: 'AISC_AUEQ_USD_PER_TOZ' | 'UNAVAILABLE';
  q1Max: number | null;
  unit: 'USD/toz' | null;
  updatedAtUtc: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  notes: string;
};

/**
 * Trial Tier-1 scale gates. These are deliberately centralized so the policy can be
 * changed without touching the assessment engine.
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
 * Static, manually updatable cost-quartile evidence.
 *
 * Never infer a Q1 boundary. If q1Max is null, the cost gate is NOT_VERIFIED.
 * Gold is currently the only covered metal for which a public, explicit Q1 boundary
 * and a compatible AISC-style metric have been verified.
 */
export const TIER1_COST_BENCHMARKS: Record<Tier1Metal, Tier1CostBenchmark> = {
  Au: {
    metal: 'Au',
    metric: 'AISC_AUEQ_USD_PER_TOZ',
    q1Max: 1_228,
    unit: 'USD/toz',
    updatedAtUtc: '2026-03-01',
    sourceLabel: 'S&P Capital IQ 2025E global gold AISC curve, reproduced by G2 Goldfields (March 2026)',
    sourceUrl: 'https://g2goldfields.com/wp-content/uploads/2026/03/G2-Goldfields-Investor-Presentation-March-2026-Public.pdf',
    notes: 'Q1 < US$1,228/oz Au. Global gold mines >25 koz 2025E; AISC shown on a co-product basis. Engine comparison is allowed only when Au is dominant (>=80% of LOM metal revenue).',
  },
  Ag: { metal: 'Ag', metric: 'UNAVAILABLE', q1Max: null, unit: null, updatedAtUtc: null, sourceLabel: null, sourceUrl: null, notes: 'Static Q1 boundary not yet verified; do not estimate from a chart.' },
  Cu: { metal: 'Cu', metric: 'UNAVAILABLE', q1Max: null, unit: null, updatedAtUtc: null, sourceLabel: null, sourceUrl: null, notes: 'Static Q1 boundary not yet verified; do not mix C1 and AISC.' },
  Zn: { metal: 'Zn', metric: 'UNAVAILABLE', q1Max: null, unit: null, updatedAtUtc: null, sourceLabel: null, sourceUrl: null, notes: 'Static Q1 boundary not yet verified.' },
  Pb: { metal: 'Pb', metric: 'UNAVAILABLE', q1Max: null, unit: null, updatedAtUtc: null, sourceLabel: null, sourceUrl: null, notes: 'Static Q1 boundary not yet verified.' },
  Ni: { metal: 'Ni', metric: 'UNAVAILABLE', q1Max: null, unit: null, updatedAtUtc: null, sourceLabel: null, sourceUrl: null, notes: 'Static Q1 boundary not yet verified; do not mix C1 and AISC.' },
  Pt: { metal: 'Pt', metric: 'UNAVAILABLE', q1Max: null, unit: null, updatedAtUtc: null, sourceLabel: null, sourceUrl: null, notes: 'PGM cost curves are commonly reported on a 3E/4E basket basis; standalone Pt threshold not yet verified.' },
  Pd: { metal: 'Pd', metric: 'UNAVAILABLE', q1Max: null, unit: null, updatedAtUtc: null, sourceLabel: null, sourceUrl: null, notes: 'PGM cost curves are commonly reported on a 3E/4E basket basis; standalone Pd threshold not yet verified.' },
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
  if (benchmark.q1Max === null || benchmark.updatedAtUtc === null) return false;
  const age = ageInDays(benchmark.updatedAtUtc, nowUtc);
  return age !== null && age >= TIER1_POLICY.costBenchmarkMaxAgeDays;
}

export function getTier1CostBenchmarkTodos(nowUtc = new Date().toISOString()): string[] {
  return Object.values(TIER1_COST_BENCHMARKS)
    .filter((benchmark) => tier1CostBenchmarkNeedsUpdate(benchmark, nowUtc))
    .map((benchmark) => `Tier-1: uppdatera statisk Q1-kostnadsgräns för ${benchmark.metal} (senast ${benchmark.updatedAtUtc}).`);
}
