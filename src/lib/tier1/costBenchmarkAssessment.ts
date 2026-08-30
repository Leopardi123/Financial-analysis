import {
  TIER1_POLICY,
  tier1CostBenchmarkNeedsUpdate,
  type Tier1CostBenchmark,
  type Tier1CostMetric,
  type Tier1Metal,
} from './config.ts';
import { classifyCostAgainstPercentiles, type Tier1Gate } from './preRevenue.ts';

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

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function gateStatus(tier: 1 | 2 | 3): 'PASS' | 'FAIL' {
  return tier === 1 ? 'PASS' : 'FAIL';
}

function displayCostUnit(unit: string): string {
  return unit === 'USD/toz' ? 'USD/oz' : unit;
}

function digitisedBoundaryNote(value: number, benchmark: Tier1CostBenchmark): string {
  const displayUnit = displayCostUnit(benchmark.unit);
  const uncertainty = benchmark.boundaryUncertaintyAbs;
  if (!(finite(uncertainty) && uncertainty > 0)) return '';
  const near: string[] = [];
  if (finite(benchmark.q1Max) && Math.abs(value - benchmark.q1Max) <= uncertainty) near.push('P25');
  if (finite(benchmark.p50Max) && Math.abs(value - benchmark.p50Max) <= uncertainty) near.push('P50');
  if (finite(benchmark.p75Max) && Math.abs(value - benchmark.p75Max) <= uncertainty) near.push('P75');
  return near.length > 0
    ? ` Värdet ligger inom ±${uncertainty} ${displayUnit} från digitaliserad ${near.join('/')}-gräns; best-estimate-gränsen används och osäkerheten är diagnostisk.`
    : '';
}

/**
 * Cost gate against the selected benchmark. Project JSON supplies the best
 * available project cost; benchmark read-off uncertainty is diagnostic rather
 * than a hard guard. Invalid/missing values, units and benchmark boundaries
 * remain fail-closed.
 *
 * Negative reported C1 values are legitimate for by-product-heavy mines and
 * remain directly comparable to a homogeneous C1 curve. Do not reject them
 * merely for being below zero.
 */
export function assessCostAgainstBenchmark(args: {
  primaryMetal: Tier1Metal;
  primaryMetalRevenueShare: number | null;
  metric: Tier1CostMetric;
  value: number;
  benchmark: Tier1CostBenchmark;
  nowUtc?: string;
}): Tier1Gate {
  const { benchmark } = args;
  const displayUnit = displayCostUnit(benchmark.unit);
  const metricLabel = COST_METRIC_LABELS[args.metric];

  if (benchmark.metal !== args.primaryMetal || benchmark.metric !== args.metric) {
    return {
      status: 'NOT_VERIFIED', tier: null, value: args.value,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `Vald kostnadssnapshot matchar inte projektets metall/metric (${args.primaryMetal}/${args.metric}).`,
    };
  }
  if (!benchmark.comparisonEnabled) {
    return {
      status: 'NOT_VERIFIED', tier: null, value: args.value,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: benchmark.q1Max === null
        ? `Kostnadskurvan för ${args.primaryMetal} (${benchmark.dataPeriod}) är definitionsidentifierad men P25/P50/P75 är ännu inte verifierade; Cost Tier får inte klassificeras.`
        : `Kostnadssnapshoten ${benchmark.dataPeriod} har inte en definitionshomogen benchmark och får inte klassificera Cost Tier.`,
    };
  }
  if (tier1CostBenchmarkNeedsUpdate(benchmark, args.nowUtc)) {
    return {
      status: 'NOT_VERIFIED', tier: null, value: args.value,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `Kostnadssnapshoten för ${args.primaryMetal} (${benchmark.dataPeriod}) är äldre än ${TIER1_POLICY.costBenchmarkMaxAgeDays} dagar och ska källverifieras på nytt.`,
    };
  }
  if (args.primaryMetal === 'Au' && (!finite(args.primaryMetalRevenueShare) || args.primaryMetalRevenueShare < TIER1_POLICY.goldCostDominanceMinimumRevenueShare)) {
    return {
      status: 'NOT_VERIFIED', tier: null, value: args.value,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `Au står för mindre än ${Math.round(TIER1_POLICY.goldCostDominanceMinimumRevenueShare * 100)} % av metallintäkten vid Tier-decket; ren Au AISC-benchmark används därför inte.`,
    };
  }

  if (!finite(args.value)) {
    return {
      status: 'NOT_VERIFIED', tier: null, value: null,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `${metricLabel} är matematiskt oanvändbar.`,
    };
  }
  if (!finite(benchmark.q1Max)) {
    return {
      status: 'NOT_VERIFIED', tier: null, value: args.value,
      threshold: null, unit: benchmark.unit,
      reason: `${metricLabel} kan inte kvartilklassificeras: P25 saknas för ${benchmark.dataPeriod}-snapshoten. Ingen gräns antas.`,
    };
  }

  if (benchmark.benchmarkKind !== 'FULL_QUARTILE_CURVE' || !finite(benchmark.p50Max)) {
    if (args.value <= benchmark.q1Max) {
      return {
        status: 'PASS', tier: 1, value: args.value,
        threshold: benchmark.q1Max, unit: benchmark.unit,
        reason: `${metricLabel} ${args.value.toFixed(2)} ${displayUnit} är ≤ Q1-referensen ${benchmark.q1Max} ${displayUnit} i ${benchmark.dataPeriod}-snapshoten och bevisar Cost Tier 1. P50 saknas, så högre cost får inte gissas till Tier 2/3.${digitisedBoundaryNote(args.value, benchmark)}`,
      };
    }
    return {
      status: 'NOT_VERIFIED', tier: null, value: args.value,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `${metricLabel} ${args.value.toFixed(2)} ${displayUnit} ligger över Q1-referensen ${benchmark.q1Max} i ${benchmark.dataPeriod}-snapshoten. Homogen P50 saknas, så Tier 2/3 får inte gissas.`,
    };
  }

  const classified = classifyCostAgainstPercentiles({
    value: args.value,
    p25Max: benchmark.q1Max,
    p50Max: benchmark.p50Max,
    p75Max: benchmark.p75Max,
    uncertaintyAbs: 0,
  });
  if (classified.tier === null) {
    return {
      status: 'NOT_VERIFIED', tier: null, value: args.value,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `${metricLabel} ${args.value.toFixed(2)} ${displayUnit}: ${classified.reason}`,
    };
  }

  const threshold = classified.tier === 1
    ? benchmark.q1Max
    : classified.tier === 2
      ? benchmark.p50Max
      : benchmark.p75Max ?? benchmark.p50Max;
  return {
    status: gateStatus(classified.tier),
    tier: classified.tier,
    value: args.value,
    threshold,
    unit: benchmark.unit,
    reason: `${metricLabel} ${args.value.toFixed(2)} ${displayUnit}. ${classified.reason}${digitisedBoundaryNote(args.value, benchmark)} Benchmark: ${benchmark.dataPeriod}${benchmark.sourcePageOrTable ? `, ${benchmark.sourcePageOrTable}` : ''}.`,
  };
}
