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

/**
 * Cost is a genuine Tier ceiling once it is known. We still preserve a useful
 * provisional structural Tier 2 when cost is not yet verified, because the
 * missing cost can only keep it at Tier 2 or lower it to Tier 3; it can never
 * promote it to Tier 1. Tier 1 itself remains blocked until cost is verified.
 */
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

  const structuralTier = Math.max(
    gates.lom.tier as TierBand,
    gates.scale.tier as TierBand,
    gates.capitalReturns.tier as TierBand,
  ) as TierBand;

  if (structuralTier === 1) {
    if (gates.cost.status === 'NOT_VERIFIED' || gates.cost.tier === null) {
      return { status: 'NOT_VERIFIED', reason: 'Projektet når Tier-1-nivå i LOM, skala och avkastning, men kostnadskvartilen kan inte verifieras.' };
    }
    if (gates.cost.tier === 3) {
      return { status: 'TIER_3', reason: 'Projektet når Tier-1-nivå strukturellt men kostnadspositionen är Tier 3 och sätter därför Tier-3-taket.' };
    }
    if (gates.cost.tier === 2) {
      return { status: 'TIER_2', reason: 'Projektet når Tier-1-nivå strukturellt men kostnadspositionen är Tier 2 och sätter därför Tier-2-taket.' };
    }
    return { status: 'TIER_1', reason: 'Tier-1-kraven uppfylls för skala, livslängd, kostnad, cykelresistens och kapitalavkastning.' };
  }

  if (structuralTier === 2) {
    if (gates.cost.tier === 3) {
      return { status: 'TIER_3', reason: 'LOM/skala/avkastning ger högst Tier 2, men verifierad Tier-3-kostnadsposition sätter det slutliga Tier-3-taket.' };
    }
    const limiters: string[] = [];
    if (gates.lom.tier === 2) limiters.push('LOM');
    if (gates.scale.tier === 2) limiters.push('produktionsskala');
    if (gates.capitalReturns.tier === 2) limiters.push('kapitalavkastning');
    if (gates.cost.status === 'NOT_VERIFIED' || gates.cost.tier === null) {
      return {
        status: 'TIER_2',
        reason: `${limiters.length > 0 ? limiters.join(', ') : 'Minst en strukturell kategori'} sätter Tier-2-taket. Kostnads-Tier är ännu ej verifierad och kan därför fortfarande sänka den provisoriska klassningen till Tier 3.`,
      };
    }
    return {
      status: 'TIER_2',
      reason: `${limiters.length > 0 ? limiters.join(', ') : 'Minst en strukturell kategori'} sätter Tier-2-taket; kostnadspositionen försämrar inte klassningen ytterligare.`,
    };
  }

  const limiters: string[] = [];
  if (gates.lom.tier === 3) limiters.push('LOM');
  if (gates.scale.tier === 3) limiters.push('produktionsskala');
  if (gates.capitalReturns.tier === 3) limiters.push('kapitalavkastning');
  return {
    status: 'TIER_3',
    reason: `${limiters.length > 0 ? limiters.join(', ') : 'Minst en strukturell kategori'} sätter Tier-3-taket; kostnad kan inte sänka klassningen ytterligare inom Tier 1–3-skalan.`,
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
  AISC_AG_CO_PRODUCT_USD_PER_TOZ: 'Ag co-product AISC',
  AISC_AGEQ_USD_PER_TOZ: 'AgEq AISC',
  C1_CU_USD_PER_LB: 'Cu C1 cash cost',
  AISC_ZNEQ_USD_PER_LB: 'ZnEq AISC',
  C1_NI_USD_PER_LB: 'Ni C1 cash cost',
  AISC_NI_USD_PER_LB: 'Ni AISC',
  AISC_PGM3E_USD_PER_TOZ: 'PGM 3E AISC',
};

export type CostPercentileClassification = {
  tier: TierBand | null;
  reason: string;
};

/**
 * Converts a homogeneous cost curve into the three Instrumentbrädan cost bands:
 * Q1/P25 => Tier 1, Q2/P25-P50 => Tier 2, and the upper half => Tier 3.
 * P75 is retained for diagnostics (Q3 vs Q4) but both map to Tier 3. A value
 * inside a digitisation uncertainty band around P25 or P50 is NOT_VERIFIED.
 */
export function classifyCostAgainstPercentiles(args: {
  value: number;
  p25Max: number;
  p50Max: number;
  p75Max?: number | null;
  uncertaintyAbs?: number;
}): CostPercentileClassification {
  const { value, p25Max, p50Max } = args;
  const p75Max = args.p75Max ?? null;
  const uncertainty = finite(args.uncertaintyAbs) && (args.uncertaintyAbs as number) >= 0 ? args.uncertaintyAbs as number : 0;

  if (!finite(value) || !finite(p25Max) || !finite(p50Max) || p25Max < 0 || p50Max < p25Max) {
    return { tier: null, reason: 'Kostnadskurvans P25/P50-värden är ogiltiga eller inte monotona.' };
  }
  if (p75Max !== null && (!finite(p75Max) || p75Max < p50Max)) {
    return { tier: null, reason: 'Kostnadskurvans P75-värde är ogiltigt eller lägre än P50.' };
  }

  if (uncertainty > 0 && Math.abs(value - p25Max) <= uncertainty) {
    return { tier: null, reason: `Kostnaden ligger inom ±${uncertainty} av den digitaliserade P25-gränsen; Tier 1/2 kan inte avgöras med tillräcklig precision.` };
  }
  if (uncertainty > 0 && Math.abs(value - p50Max) <= uncertainty) {
    return { tier: null, reason: `Kostnaden ligger inom ±${uncertainty} av den digitaliserade P50-gränsen; Tier 2/3 kan inte avgöras med tillräcklig precision.` };
  }

  if (value <= p25Max) {
    return { tier: 1, reason: `Kostnaden ligger i första kvartilen (≤P25 ${p25Max}).` };
  }
  if (value <= p50Max) {
    return { tier: 2, reason: `Kostnaden ligger i andra kvartilen (>P25 ${p25Max}, ≤P50 ${p50Max}).` };
  }
  if (p75Max !== null && value <= p75Max) {
    return { tier: 3, reason: `Kostnaden ligger i tredje kvartilen (>P50 ${p50Max}, ≤P75 ${p75Max}) och klassas Cost Tier 3.` };
  }
  if (p75Max !== null) {
    return { tier: 3, reason: `Kostnaden ligger i fjärde kvartilen (>P75 ${p75Max}); Q3 och Q4 klassas båda Cost Tier 3 enligt nuvarande trebandspolicy.` };
  }
  return { tier: 3, reason: `Kostnaden ligger över medianen P50 ${p50Max} och klassas Cost Tier 3; P75 saknas så Q3/Q4 separeras inte.` };
}

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

  if (!benchmark.comparisonEnabled) {
    return {
      status: 'NOT_VERIFIED', tier: null, value: finite(value) ? value : null,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: benchmark.q1Max === null
        ? `Kostnadskurvan för ${args.primaryMetal} är identifierad men P25/P50/P75 är ännu inte verifierade. Ingen kostnads-Tier antas.`
        : `Kostnadsreferensen för ${args.primaryMetal} har inte en definitionshomogen benchmark och får därför inte klassificera Cost Tier.`,
    };
  }
  if (tier1CostBenchmarkNeedsUpdate(benchmark, args.nowUtc)) {
    return { status: 'NOT_VERIFIED', tier: null, value: finite(value) ? value : null, threshold: benchmark.q1Max, unit: benchmark.unit, reason: `Den statiska kostnadskurvan för ${args.primaryMetal} är äldre än ${TIER1_POLICY.costBenchmarkMaxAgeDays} dagar och ska uppdateras.` };
  }
  if (args.primaryMetal === 'Au' && (!finite(args.primaryMetalRevenueShare) || args.primaryMetalRevenueShare < TIER1_POLICY.goldCostDominanceMinimumRevenueShare)) {
    return { status: 'NOT_VERIFIED', tier: null, value: finite(value) ? value : null, threshold: benchmark.q1Max, unit: benchmark.unit, reason: `Au står för mindre än ${Math.round(TIER1_POLICY.goldCostDominanceMinimumRevenueShare * 100)} % av metallintäkten vid Tier-decket; ren Au AISC-benchmark används därför inte.` };
  }
  if (!finite(value)) {
    return { status: 'NOT_VERIFIED', tier: null, value: null, threshold: benchmark.q1Max, unit: benchmark.unit, reason: `${metricLabel} kan ännu inte beräknas definitionskompatibelt från projektmodellen. Inget kostnadsvärde antas.` };
  }
  if (!finite(benchmark.q1Max)) {
    return { status: 'NOT_VERIFIED', tier: null, value, threshold: null, unit: benchmark.unit, reason: `${metricLabel} finns, men P25-gränsen för benchmarken är Ej verifierad. Ingen kostnads-Tier antas.` };
  }

  if (benchmark.benchmarkKind !== 'FULL_QUARTILE_CURVE' || !finite(benchmark.p50Max)) {
    if (value <= benchmark.q1Max) {
      return {
        status: 'PASS', tier: 1, value, threshold: benchmark.q1Max, unit: benchmark.unit,
        reason: `${metricLabel} ${value.toFixed(2)} ${benchmark.unit} är ≤ den verifierade Q1-referensen ${benchmark.q1Max} ${benchmark.unit} och bevisar Cost Tier 1. P50/P75 saknas fortfarande.`,
      };
    }
    return {
      status: 'NOT_VERIFIED', tier: null, value, threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `${metricLabel} ${value.toFixed(2)} ${benchmark.unit} ligger över Q1-referensen ${benchmark.q1Max}. En homogen P50-gräns saknas, så Tier 2 och Tier 3 får inte gissas.`,
    };
  }

  const classified = classifyCostAgainstPercentiles({
    value,
    p25Max: benchmark.q1Max,
    p50Max: benchmark.p50Max,
    p75Max: benchmark.p75Max,
    uncertaintyAbs: benchmark.boundaryUncertaintyAbs,
  });
  if (classified.tier === null) {
    return {
      status: 'NOT_VERIFIED', tier: null, value,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `${metricLabel} ${value.toFixed(2)} ${benchmark.unit}: ${classified.reason}`,
    };
  }

  const threshold = classified.tier === 1
    ? benchmark.q1Max
    : classified.tier === 2
      ? benchmark.p50Max
      : benchmark.p75Max ?? benchmark.p50Max;
  return {
    status: tierStatus(classified.tier),
    tier: classified.tier,
    value,
    threshold,
    unit: benchmark.unit,
    reason: `${metricLabel} ${value.toFixed(2)} ${benchmark.unit}. ${classified.reason}`,
  };
}
