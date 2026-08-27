import {
  TIER1_COST_BENCHMARKS,
  TIER1_POLICY,
  TIER1_PRODUCTION_THRESHOLDS,
  isTier1Metal,
  tier1CostBenchmarkNeedsUpdate,
  type Tier1Metal,
} from './config.ts';

export type Tier1GateStatus = 'PASS' | 'FAIL' | 'NOT_VERIFIED';
export type Tier1OverallStatus = 'TIER_1' | 'NOT_TIER_1' | 'NOT_VERIFIED';

export type Tier1Gate = {
  status: Tier1GateStatus;
  value: number | null;
  threshold: number | null;
  unit: string | null;
  reason: string;
};

export type Tier1PreRevenueAssessment = {
  status: Tier1OverallStatus;
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
    reportBaseNpv10Usd: number | null;
    reportBaseIrr: number | null;
    reportBaseNpvOverInitialCapex: number | null;
    cycleNpv10Usd: number | null;
    cycleDurationProductionPeriods: number;
    cycleMultipliersByMetal: Record<string, number>;
    cycleMethod: string | null;
  };
  diagnostics: string[];
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function combineTier1GateStatuses(gates: Tier1PreRevenueAssessment['gates']): Tier1OverallStatus {
  const statuses = Object.values(gates).map((gate) => gate.status);
  if (statuses.includes('FAIL')) return 'NOT_TIER_1';
  if (statuses.includes('NOT_VERIFIED')) return 'NOT_VERIFIED';
  return 'TIER_1';
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
    return { status: 'NOT_VERIFIED', value: null, threshold: TIER1_POLICY.minimumLomYears, unit: 'år', reason: 'LOM kunde inte verifieras från payable production.' };
  }
  return {
    status: lomYears >= TIER1_POLICY.minimumLomYears ? 'PASS' : 'FAIL',
    value: lomYears,
    threshold: TIER1_POLICY.minimumLomYears,
    unit: 'år',
    reason: `LOM ${lomYears} år; krav >= ${TIER1_POLICY.minimumLomYears} år.`,
  };
}

export function assessScale(args: { primaryMetal: Tier1Metal | null; averageAnnualPayable: number | null }): Tier1Gate {
  if (!args.primaryMetal) {
    return { status: 'NOT_VERIFIED', value: null, threshold: null, unit: null, reason: 'Primär metall kunde inte fastställas från LOM revenue.' };
  }
  const threshold = TIER1_PRODUCTION_THRESHOLDS[args.primaryMetal];
  if (!finite(args.averageAnnualPayable)) {
    return { status: 'NOT_VERIFIED', value: null, threshold: threshold.minimumAnnualPayable, unit: threshold.unit, reason: `Årlig payable ${args.primaryMetal}-produktion kunde inte verifieras.` };
  }
  return {
    status: args.averageAnnualPayable >= threshold.minimumAnnualPayable ? 'PASS' : 'FAIL',
    value: args.averageAnnualPayable,
    threshold: threshold.minimumAnnualPayable,
    unit: threshold.unit,
    reason: `LOM-genomsnitt ${args.primaryMetal}: ${args.averageAnnualPayable}; krav ${threshold.label}.`,
  };
}

export function assessCapitalReturns(reportBaseIrr: number | null): Tier1Gate {
  if (!finite(reportBaseIrr)) {
    return { status: 'NOT_VERIFIED', value: null, threshold: TIER1_POLICY.minimumAfterTaxIrr, unit: 'IRR', reason: 'Rapport-/base-IRR kunde inte kontrollräknas från rapportens prisdeck.' };
  }
  return {
    status: reportBaseIrr >= TIER1_POLICY.minimumAfterTaxIrr ? 'PASS' : 'FAIL',
    value: reportBaseIrr,
    threshold: TIER1_POLICY.minimumAfterTaxIrr,
    unit: 'IRR',
    reason: `After-tax report/base IRR ${(reportBaseIrr * 100).toFixed(1)}%; krav >= ${(TIER1_POLICY.minimumAfterTaxIrr * 100).toFixed(0)}%.`,
  };
}

export function assessCycle(cycleNpv10Usd: number | null, reasonIfUnavailable?: string): Tier1Gate {
  if (!finite(cycleNpv10Usd)) {
    return { status: 'NOT_VERIFIED', value: null, threshold: 0, unit: 'USD NPV10', reason: reasonIfUnavailable ?? 'Relativt bear-scenario kunde inte verifieras.' };
  }
  return {
    status: cycleNpv10Usd > 0 ? 'PASS' : 'FAIL',
    value: cycleNpv10Usd,
    threshold: 0,
    unit: 'USD NPV10',
    reason: `${TIER1_POLICY.cycleDurationProductionPeriods}-perioders relativ lågcykel ger NPV10 ${cycleNpv10Usd.toFixed(0)} USD; krav > 0.`,
  };
}

export function assessCost(args: {
  primaryMetal: Tier1Metal | null;
  primaryMetalRevenueShare: number | null;
  aiscAuEqUsdPerOz: number | null;
  nowUtc?: string;
}): Tier1Gate {
  if (!args.primaryMetal) {
    return { status: 'NOT_VERIFIED', value: null, threshold: null, unit: null, reason: 'Primär metall saknas.' };
  }
  const benchmark = TIER1_COST_BENCHMARKS[args.primaryMetal];
  if (benchmark.q1Max === null || benchmark.metric === 'UNAVAILABLE') {
    return { status: 'NOT_VERIFIED', value: null, threshold: null, unit: null, reason: `Statisk verifierad Q1-kostnadsgräns saknas för ${args.primaryMetal}.` };
  }
  if (tier1CostBenchmarkNeedsUpdate(benchmark, args.nowUtc)) {
    return { status: 'NOT_VERIFIED', value: args.aiscAuEqUsdPerOz, threshold: benchmark.q1Max, unit: benchmark.unit, reason: `Q1-benchmark för ${args.primaryMetal} är äldre än ${TIER1_POLICY.costBenchmarkMaxAgeDays} dagar och måste uppdateras.` };
  }
  if (args.primaryMetal !== 'Au') {
    return { status: 'NOT_VERIFIED', value: null, threshold: benchmark.q1Max, unit: benchmark.unit, reason: `Nuvarande canonical engine har ingen verifierad ${args.primaryMetal}-specifik kostnadsdefinition som matchar benchmark.` };
  }
  if (!finite(args.primaryMetalRevenueShare) || args.primaryMetalRevenueShare < TIER1_POLICY.goldCostDominanceMinimumRevenueShare) {
    return { status: 'NOT_VERIFIED', value: args.aiscAuEqUsdPerOz, threshold: benchmark.q1Max, unit: benchmark.unit, reason: `Au måste stå för minst ${Math.round(TIER1_POLICY.goldCostDominanceMinimumRevenueShare * 100)}% av LOM metal revenue för jämförelse mellan AuEq AISC och Au Q1.` };
  }
  if (!finite(args.aiscAuEqUsdPerOz)) {
    return { status: 'NOT_VERIFIED', value: null, threshold: benchmark.q1Max, unit: benchmark.unit, reason: 'Canonical AuEq AISC kunde inte beräknas.' };
  }
  return {
    status: args.aiscAuEqUsdPerOz < benchmark.q1Max ? 'PASS' : 'FAIL',
    value: args.aiscAuEqUsdPerOz,
    threshold: benchmark.q1Max,
    unit: benchmark.unit,
    reason: `AuEq AISC ${args.aiscAuEqUsdPerOz.toFixed(0)} USD/oz mot statisk Q1-gräns < ${benchmark.q1Max} USD/oz. ${benchmark.sourceLabel ?? ''}`.trim(),
  };
}
