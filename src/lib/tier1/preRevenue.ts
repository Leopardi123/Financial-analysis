import {
  TIER1_COST_BENCHMARKS,
  TIER1_POLICY,
  TIER1_PRODUCTION_THRESHOLDS,
  isTier1Metal,
  tier1CostBenchmarkNeedsUpdate,
  tierBandFromIrr,
  tierBandFromLom,
  tierBandFromScaleEquivalent,
  type Tier1CostMetric,
  type Tier1Metal,
  type TierBand,
} from './config.ts';

export type Tier1GateStatus = 'PASS' | 'FAIL' | 'NOT_VERIFIED';
export type Tier1OverallStatus = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'NOT_QUALIFIED' | 'NOT_VERIFIED';

export type Tier1Gate = {
  status: Tier1GateStatus;
  tier: TierBand | null;
  value: number | null;
  threshold: number | null;
  unit: string | null;
  reason: string;
};

export type Tier1PreRevenueAssessment = {
  status: Tier1OverallStatus;
  classificationReason: string;
  primaryMetal: Tier1Metal | null;
  primaryMetalRevenueShare: number | null;
  gates: {
    lom: Tier1Gate;
    scale: Tier1Gate;
    cost: Tier1Gate;
    cycle: Tier1Gate;
    capitalReturns: Tier1Gate;
  };
  support: {
    tierBasePriceMode: 'SPOT';
    tierBasePriceAsOfUtc: string | null;
    tierBaseNpv10Usd: number | null;
    tierBaseIrr: number | null;
    tierBaseNpvOverInitialCapex: number | null;
    cycleNpv10Usd: number | null;
    cycleDurationProductionPeriods: number;
    cycleMultipliersByMetal: Record<string, number>;
    cycleMethod: string | null;
    averageAnnualPayableByMetal?: Partial<Record<Tier1Metal, number>>;
    scaleEquivalentByMetal?: Partial<Record<Tier1Metal, number>>;
    combinedScaleEquivalent?: number | null;
    scaleWindowStartYear?: number | null;
    scaleWindowEndYear?: number | null;
    scaleWindowYears?: number | null;
    costMetric?: Tier1CostMetric | null;
    costMetricValue?: number | null;
  };
  diagnostics: string[];
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function tierStatus(tier: TierBand): Tier1GateStatus {
  return tier === 1 ? 'PASS' : 'FAIL';
}

export function classifyTier(gates: Tier1PreRevenueAssessment['gates']): {
  status: Tier1OverallStatus;
  reason: string;
} {
  if (gates.capitalReturns.status === 'FAIL' && gates.capitalReturns.tier === null) {
    return { status: 'NOT_QUALIFIED', reason: 'After-tax IRR ligger under miniminivån 15 %.' };
  }
  if (gates.cycle.status === 'FAIL') {
    return { status: 'NOT_QUALIFIED', reason: 'Projektet klarar inte det definierade bear-scenariot med positiv NPV10.' };
  }

  const essential = [gates.lom, gates.scale, gates.capitalReturns, gates.cycle];
  if (essential.some((gate) => gate.status === 'NOT_VERIFIED' || gate.tier === null)) {
    return { status: 'NOT_VERIFIED', reason: 'En eller flera kategorier som kan ändra Tier eller kvalificering är inte verifierade.' };
  }

  const baseTier = Math.max(
    gates.lom.tier as TierBand,
    gates.scale.tier as TierBand,
    gates.capitalReturns.tier as TierBand,
  ) as TierBand;

  if (baseTier === 1) {
    if (gates.cost.status === 'NOT_VERIFIED' || gates.cost.tier === null) {
      return { status: 'NOT_VERIFIED', reason: 'Projektet når Tier-1-nivå i övriga kriterier, men Q1-kostnadspositionen kan inte verifieras.' };
    }
    if (gates.cost.tier >= 2) {
      return { status: 'TIER_2', reason: 'Projektet når Tier-1-nivå i skala, LOM och avkastning men ligger inte i verifierad Q1-kostnadsposition.' };
    }
    return { status: 'TIER_1', reason: 'Tier-1-kraven uppfylls för skala, livslängd, kostnad, cykelresistens och kapitalavkastning.' };
  }

  if (baseTier === 2) {
    const limiters: string[] = [];
    if (gates.lom.tier === 2) limiters.push('LOM');
    if (gates.scale.tier === 2) limiters.push('produktionsskala');
    if (gates.capitalReturns.tier === 2) limiters.push('kapitalavkastning');
    return {
      status: 'TIER_2',
      reason: `${limiters.length > 0 ? limiters.join(', ') : 'Minst en strukturell kategori'} sätter Tier-2-taket; projektet klarar samtidigt miniminivån för ekonomi och cykelresistens.`,
    };
  }

  const limiters: string[] = [];
  if (gates.lom.tier === 3) limiters.push('LOM');
  if (gates.scale.tier === 3) limiters.push('produktionsskala');
  if (gates.capitalReturns.tier === 3) limiters.push('kapitalavkastning');
  return {
    status: 'TIER_3',
    reason: `${limiters.length > 0 ? limiters.join(', ') : 'Minst en strukturell kategori'} sätter Tier-3-taket.`,
  };
}

export function determinePrimaryMetal(revenueByMetalUsd: Record<string, number>): {
  metal: Tier1Metal | null;
  share: number | null;
} {
  const entries = Object.entries(revenueByMetalUsd)
    .filter(([metal, value]) => isTier1Metal(metal) && finite(value) && value > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (entries.length === 0 || total <= 0) return { metal: null, share: null };
  return { metal: entries[0][0] as Tier1Metal, share: entries[0][1] / total };
}

export function assessLom(lomYears: number | null): Tier1Gate {
  if (!finite(lomYears)) {
    return { status: 'NOT_VERIFIED', tier: null, value: null, threshold: TIER1_POLICY.tier1LomYears, unit: 'år', reason: 'LOM kunde inte verifieras från fysisk payable production.' };
  }
  const tier = tierBandFromLom(lomYears);
  const reason = tier === 1
    ? `LOM ${lomYears} år · Tier 1 kräver minst ${TIER1_POLICY.tier1LomYears} år.`
    : tier === 2
      ? `LOM ${lomYears} år · Tier 2 (${TIER1_POLICY.tier2LomYears}–${TIER1_POLICY.tier1LomYears - 1} år).`
      : `LOM ${lomYears} år · under ${TIER1_POLICY.tier2LomYears} år ger högst Tier 3.`;
  return { status: tierStatus(tier), tier, value: lomYears, threshold: TIER1_POLICY.tier1LomYears, unit: 'år', reason };
}

export function assessCombinedScale(
  averageAnnualPayableByMetal: Partial<Record<Tier1Metal, number>>,
  windowLabel?: string,
): { gate: Tier1Gate; equivalentByMetal: Partial<Record<Tier1Metal, number>>; combinedEquivalent: number | null } {
  const equivalentByMetal: Partial<Record<Tier1Metal, number>> = {};
  let combined = 0;
  let observed = 0;

  for (const [metal, value] of Object.entries(averageAnnualPayableByMetal) as Array<[Tier1Metal, number | undefined]>) {
    if (!finite(value) || value < 0 || !isTier1Metal(metal)) continue;
    const threshold = TIER1_PRODUCTION_THRESHOLDS[metal].minimumAnnualPayable;
    if (!(threshold > 0)) continue;
    const equivalent = value / threshold;
    equivalentByMetal[metal] = equivalent;
    combined += equivalent;
    observed += 1;
  }

  if (observed === 0) {
    return {
      gate: { status: 'NOT_VERIFIED', tier: null, value: null, threshold: TIER1_POLICY.tier1ScaleEquivalent, unit: 'scale-equivalent', reason: 'Payable produktion per metall kunde inte verifieras.' },
      equivalentByMetal,
      combinedEquivalent: null,
    };
  }

  const tier = tierBandFromScaleEquivalent(combined);
  const parts = (Object.entries(equivalentByMetal) as Array<[Tier1Metal, number]>)
    .sort((a, b) => b[1] - a[1])
    .map(([metal, equivalent]) => `${metal} ${equivalent.toFixed(2)}x`);
  const band = tier === 1 ? 'Tier 1' : tier === 2 ? 'Tier 2' : 'Tier 3';
  const suffix = windowLabel ? ` · ${windowLabel}` : '';
  return {
    gate: {
      status: tierStatus(tier),
      tier,
      value: combined,
      threshold: TIER1_POLICY.tier1ScaleEquivalent,
      unit: 'scale-equivalent',
      reason: `${parts.join(' + ')} = ${combined.toFixed(2)}x · ${band}${suffix}. Tier 1 ≥1,00x; Tier 2 ≥0,40x; Tier 3 <0,40x.`,
    },
    equivalentByMetal,
    combinedEquivalent: combined,
  };
}

export function assessCapitalReturns(tierBaseIrr: number | null): Tier1Gate {
  if (!finite(tierBaseIrr)) {
    return { status: 'NOT_VERIFIED', tier: null, value: null, threshold: TIER1_POLICY.tier1AfterTaxIrr, unit: 'IRR', reason: 'Tier-IRR vid gemensamt spot-deck kunde inte verifieras.' };
  }
  const tier = tierBandFromIrr(tierBaseIrr);
  if (tier === null) {
    return {
      status: 'FAIL', tier: null, value: tierBaseIrr, threshold: TIER1_POLICY.minimumQualifiedAfterTaxIrr, unit: 'IRR',
      reason: `After-tax Tier-IRR ${(tierBaseIrr * 100).toFixed(1)} % vid spot · under ${(TIER1_POLICY.minimumQualifiedAfterTaxIrr * 100).toFixed(0)} % och därför Ej kvalificerad.`,
    };
  }
  const reason = tier === 1
    ? `After-tax Tier-IRR ${(tierBaseIrr * 100).toFixed(1)} % vid spot · Tier 1 kräver ≥${(TIER1_POLICY.tier1AfterTaxIrr * 100).toFixed(0)} %.`
    : tier === 2
      ? `After-tax Tier-IRR ${(tierBaseIrr * 100).toFixed(1)} % vid spot · Tier 2 (${(TIER1_POLICY.tier2AfterTaxIrr * 100).toFixed(0)}–${(TIER1_POLICY.tier1AfterTaxIrr * 100).toFixed(0)} %).`
      : `After-tax Tier-IRR ${(tierBaseIrr * 100).toFixed(1)} % vid spot · Tier 3-ekonomi; miniminivå ${(TIER1_POLICY.minimumQualifiedAfterTaxIrr * 100).toFixed(0)} %.`;
  return { status: tierStatus(tier), tier, value: tierBaseIrr, threshold: TIER1_POLICY.tier1AfterTaxIrr, unit: 'IRR', reason };
}

export function assessCycle(cycleNpv10Usd: number | null, reasonIfUnavailable?: string): Tier1Gate {
  if (!finite(cycleNpv10Usd)) {
    return { status: 'NOT_VERIFIED', tier: null, value: null, threshold: 0, unit: 'USD NPV10', reason: reasonIfUnavailable ?? 'Bear-scenariot kunde inte verifieras.' };
  }
  const pass = cycleNpv10Usd > 0;
  return {
    status: pass ? 'PASS' : 'FAIL',
    tier: pass ? 1 : null,
    value: cycleNpv10Usd,
    threshold: 0,
    unit: 'USD NPV10',
    reason: pass
      ? `${TIER1_POLICY.cycleDurationProductionPeriods} års relativ lågcykel från gemensamt spot-deck ger positiv NPV10 och klarar kvalificeringskravet.`
      : `${TIER1_POLICY.cycleDurationProductionPeriods} års relativ lågcykel från gemensamt spot-deck ger NPV10 ≤ 0 och projektet är Ej kvalificerat.`,
  };
}

const COST_METRIC_LABELS: Record<Tier1CostMetric, string> = {
  AISC_AU_USD_PER_TOZ: 'Au AISC',
  AISC_AGEQ_USD_PER_TOZ: 'AgEq AISC',
  C1_CU_USD_PER_LB: 'Cu C1 cash cost',
  AISC_ZNEQ_USD_PER_LB: 'ZnEq AISC',
  C1_NI_USD_PER_LB: 'Ni C1 cash cost',
  AISC_NI_USD_PER_LB: 'Ni AISC',
  AISC_PGM3E_USD_PER_TOZ: 'PGM 3E AISC',
};

export function assessCost(args: {
  primaryMetal: Tier1Metal | null;
  primaryMetalRevenueShare: number | null;
  costMetricValues: Partial<Record<Tier1CostMetric, number>>;
  nowUtc?: string;
}): Tier1Gate {
  if (!args.primaryMetal) {
    return { status: 'NOT_VERIFIED', tier: null, value: null, threshold: null, unit: null, reason: 'Primär metall kunde inte fastställas för kostnadsbedömningen.' };
  }
  const benchmark = TIER1_COST_BENCHMARKS[args.primaryMetal];
  const value = args.costMetricValues[benchmark.metric];
  const metricLabel = COST_METRIC_LABELS[benchmark.metric];

  if (tier1CostBenchmarkNeedsUpdate(benchmark, args.nowUtc)) {
    return { status: 'NOT_VERIFIED', tier: null, value: finite(value) ? value : null, threshold: benchmark.q1Max, unit: benchmark.unit, reason: `Den statiska Q1-referensen för ${args.primaryMetal} är äldre än ${TIER1_POLICY.costBenchmarkMaxAgeDays} dagar och ska uppdateras.` };
  }
  if (args.primaryMetal === 'Au' && (!finite(args.primaryMetalRevenueShare) || args.primaryMetalRevenueShare < TIER1_POLICY.goldCostDominanceMinimumRevenueShare)) {
    return { status: 'NOT_VERIFIED', tier: null, value: finite(value) ? value : null, threshold: benchmark.q1Max, unit: benchmark.unit, reason: `Au står för mindre än ${Math.round(TIER1_POLICY.goldCostDominanceMinimumRevenueShare * 100)} % av metallintäkten vid Tier-decket; AuEq AISC används därför inte som ren Au-AISC.` };
  }
  if (!finite(value)) {
    return { status: 'NOT_VERIFIED', tier: null, value: null, threshold: benchmark.q1Max, unit: benchmark.unit, reason: `${metricLabel} kan ännu inte beräknas definitionskompatibelt från projektmodellen. Q1-referensen finns, men inget värde antas.` };
  }

  const below = value <= benchmark.q1Max;
  if (below) {
    return {
      status: 'PASS', tier: 1, value, threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `${metricLabel} ${value.toFixed(2)} ${benchmark.unit} är ≤ den statiska Q1-referensen ${benchmark.q1Max} ${benchmark.unit}.`,
    };
  }
  if (benchmark.benchmarkKind === 'EXACT_Q1_BOUNDARY') {
    return {
      status: 'FAIL', tier: 2, value, threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `${metricLabel} ${value.toFixed(2)} ${benchmark.unit} ligger över den publicerade Q1-gränsen ${benchmark.q1Max}; kostnad sätter högst Tier 2.`,
    };
  }
  return {
    status: 'NOT_VERIFIED', tier: null, value, threshold: benchmark.q1Max, unit: benchmark.unit,
    reason: `${metricLabel} ${value.toFixed(2)} ${benchmark.unit} ligger över en konservativ Q1-referens. Exakt Q1/Q2-gräns saknas, därför varken godkänd eller underkänd.`,
  };
}