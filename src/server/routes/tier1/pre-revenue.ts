import type { PriceKey } from '../../../lib/prices/keys.ts';
import { getPriceKeyDefinition } from '../../../lib/prices/keys.ts';
import { readHistoryRowsInRange } from '../../../lib/prices/db/readHistory.ts';
import { refreshHistoryRangeToMonthlyBlobs } from '../../../lib/prices/refreshHistory.ts';
import { loadProjectsForSymbol } from '../../../lib/api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../../../lib/project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../../../lib/project/jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../../../lib/project/engineFullProductionV1.ts';
import { computeProjectPhase2 } from '../../../lib/project/phase2.ts';
import { computeTier1CycleMultiplier, toMonthlyLast, type Tier1CycleMultiplierResult } from '../../../lib/tier1/cycle.ts';
import {
  TIER1_COST_BENCHMARKS,
  TIER1_POLICY,
  TIER1_PRODUCTION_THRESHOLDS,
  isTier1Metal,
  type Tier1CostMetric,
  type Tier1Metal,
} from '../../../lib/tier1/config.ts';
import {
  assessCapitalReturns,
  assessCombinedScale,
  assessCost,
  assessCycle,
  assessLom,
  classifyTier,
  type Tier1Gate,
  type Tier1PreRevenueAssessment,
} from '../../../lib/tier1/preRevenue.ts';
import { assessCostAgainstBenchmark } from '../../../lib/tier1/costBenchmarkAssessment.ts';

const LB_PER_TONNE = 2204.6226218487757;
const GRAMS_PER_TOZ = 31.1034768;
const GRAMS_PER_KG = 1_000;
const GRAMS_PER_LB = 453.59237;
const GRAMS_PER_TONNE = 1_000_000;
const GRAMS_PER_SHORT_TON = 907_184.74;
const GRAMS_PER_LONG_TON = 1_016_046.9088;

type ProjectPrepared = {
  projectId: string;
  yearsByPeriod: number[];
  productionStartPeriod: number;
  priceKeyByMetal: Record<string, string>;
  basePriceByKey: Record<string, number>;
  baseInput: Awaited<ReturnType<typeof resolveProjectPricesToEngineInput>>;
  baseOutput: ReturnType<typeof computeProjectEngineFullProductionV1>;
};

type ScaleWindow = {
  startYear: number | null;
  endYear: number | null;
  years: number | null;
  averagesByMetal: Partial<Record<Tier1Metal, number>>;
  combinedEquivalent: number | null;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function scalarPrice(series: Array<number | null> | undefined): number | null {
  if (!Array.isArray(series)) return null;
  const finiteValues = series.filter((value): value is number => finite(value) && value > 0);
  if (finiteValues.length === 0) return null;
  const first = finiteValues[0];
  const tolerance = Math.max(1e-9, Math.abs(first) * 1e-9);
  if (finiteValues.some((value) => Math.abs(value - first) > tolerance)) return null;
  return first;
}

function resolvedSpotPriceByKey(
  input: Awaited<ReturnType<typeof resolveProjectPricesToEngineInput>>,
  priceKeyByMetal: Record<string, string>,
): Record<string, number> | null {
  const prices: Record<string, number> = {};
  for (const [metal, priceKey] of Object.entries(priceKeyByMetal)) {
    const price = scalarPrice(input.spotPriceUSDByMetal[metal]);
    if (!priceKey || price === null) return null;
    const existing = prices[priceKey];
    if (finite(existing)) {
      const tolerance = Math.max(1e-9, Math.abs(existing) * 1e-9);
      if (Math.abs(existing - price) > tolerance) return null;
    }
    prices[priceKey] = price;
  }
  return prices;
}

function addToNestedMap(target: Map<string, Map<number, number>>, key: string, year: number, value: number): void {
  const byYear = target.get(key) ?? new Map<number, number>();
  byYear.set(year, (byYear.get(year) ?? 0) + value);
  target.set(key, byYear);
}

function payableQuantityInGrams(value: number, unit: string): number | null {
  if (unit === 'g') return value;
  if (unit === 'kg') return value * GRAMS_PER_KG;
  if (unit === 'lb') return value * GRAMS_PER_LB;
  if (unit === 'tonne') return value * GRAMS_PER_TONNE;
  if (unit === 'short_ton') return value * GRAMS_PER_SHORT_TON;
  if (unit === 'long_ton') return value * GRAMS_PER_LONG_TON;
  if (unit === 'toz') return value * GRAMS_PER_TOZ;
  return null;
}

function standardPayableQuantity(
  metal: Tier1Metal,
  quantityUnit: string | undefined,
  value: number,
): { value: number; unit: 'toz' | 'tonne' } | null {
  if (!quantityUnit) return null;
  const grams = payableQuantityInGrams(value, quantityUnit);
  if (!finite(grams) || grams < 0) return null;
  if (metal === 'Au' || metal === 'Ag' || metal === 'Pt' || metal === 'Pd') {
    return { value: grams / GRAMS_PER_TOZ, unit: 'toz' };
  }
  return { value: grams / GRAMS_PER_TONNE, unit: 'tonne' };
}

function combinedScaleEquivalent(averages: Partial<Record<Tier1Metal, number>>): number {
  let total = 0;
  for (const [metal, value] of Object.entries(averages) as Array<[Tier1Metal, number | undefined]>) {
    if (!isTier1Metal(metal) || !finite(value) || value < 0) continue;
    total += value / TIER1_PRODUCTION_THRESHOLDS[metal].minimumAnnualPayable;
  }
  return total;
}

function bestSustainedScaleWindow(
  quantityByMetalByYear: Map<string, Map<number, number>>,
  productionYears: Set<number>,
): ScaleWindow {
  if (productionYears.size === 0) {
    return { startYear: null, endYear: null, years: null, averagesByMetal: {}, combinedEquivalent: null };
  }
  const years = [...productionYears].sort((a, b) => a - b);
  const minYear = years[0];
  const maxYear = years[years.length - 1];
  const span = maxYear - minYear + 1;
  const windowYears = Math.min(TIER1_POLICY.sustainedScaleYears, span);
  let best: ScaleWindow | null = null;

  for (let start = minYear; start <= maxYear - windowYears + 1; start += 1) {
    const end = start + windowYears - 1;
    const averages: Partial<Record<Tier1Metal, number>> = {};
    for (const [metalRaw, byYear] of quantityByMetalByYear.entries()) {
      if (!isTier1Metal(metalRaw)) continue;
      let sum = 0;
      for (let year = start; year <= end; year += 1) sum += byYear.get(year) ?? 0;
      averages[metalRaw] = sum / windowYears;
    }
    const equivalent = combinedScaleEquivalent(averages);
    if (!best || equivalent > (best.combinedEquivalent ?? -Infinity)) {
      best = { startYear: start, endYear: end, years: windowYears, averagesByMetal: averages, combinedEquivalent: equivalent };
    }
  }

  return best ?? { startYear: null, endYear: null, years: null, averagesByMetal: {}, combinedEquivalent: null };
}

function aggregateFcffByYear(projects: Array<{ yearsByPeriod: number[]; fcff: Array<number | null> }>): {
  years: number[];
  fcff: Array<number | null>;
} | null {
  if (projects.length === 0) return null;
  const minYear = Math.min(...projects.flatMap((project) => project.yearsByPeriod));
  const maxYear = Math.max(...projects.flatMap((project) => project.yearsByPeriod));
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => minYear + index);
  const byYear = new Map<number, number>();
  for (const project of projects) {
    for (let t = 0; t < project.yearsByPeriod.length; t += 1) {
      const value = project.fcff[t];
      if (!finite(value)) return null;
      const year = project.yearsByPeriod[t];
      byYear.set(year, (byYear.get(year) ?? 0) + value);
    }
  }
  return { years, fcff: years.map((year) => byYear.get(year) ?? 0) };
}

function firstProductionIndex(years: number[], productionYears: Set<number>): number {
  const found = years.findIndex((year) => productionYears.has(year));
  return found >= 0 ? found : 0;
}

function dateYearsAgo(yearsAgo: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - yearsAgo);
  return date.toISOString().slice(0, 10);
}

async function loadCycleMultiplier(priceKey: string): Promise<Tier1CycleMultiplierResult> {
  const from = dateYearsAgo(TIER1_POLICY.cycleLookbackYears);
  const to = new Date().toISOString().slice(0, 10);
  let history = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
  let monthlyCount = toMonthlyLast(history.rows).length;

  if (monthlyCount < TIER1_POLICY.minimumHistoryMonths) {
    try {
      await refreshHistoryRangeToMonthlyBlobs({ priceKey: priceKey as PriceKey, from, to });
      history = await readHistoryRowsInRange({ priceKey: priceKey as PriceKey, from, to });
      monthlyCount = toMonthlyLast(history.rows).length;
    } catch (error) {
      return {
        status: 'NOT_VERIFIED', multiplier: null, monthlyObservations: monthlyCount,
        ratioObservations: 0, bearEpisodes: 0,
        method: 'Uthålliga relativa lågcykelepisoder',
        reason: `Historikuppdatering misslyckades för ${priceKey}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return computeTier1CycleMultiplier(history.rows);
}

function cloneEngineInput<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
}

function applyBearCycle(
  prepared: ProjectPrepared,
  multiplierByPriceKey: Record<string, number>,
): ReturnType<typeof computeProjectEngineFullProductionV1> | null {
  const stressed = cloneEngineInput(prepared.baseInput);
  const fromT = prepared.productionStartPeriod;
  const toT = Math.min(stressed.masterN, fromT + TIER1_POLICY.cycleDurationProductionPeriods - 1);

  for (const [metal, series] of Object.entries(stressed.spotPriceUSDByMetal)) {
    const priceKey = prepared.priceKeyByMetal[metal];
    const multiplier = multiplierByPriceKey[priceKey];
    if (!finite(multiplier) || multiplier <= 0 || multiplier >= 1) return null;
    for (let t = fromT; t <= toT; t += 1) {
      if (finite(series[t])) series[t] = (series[t] as number) * multiplier;
    }
    const keyed = stressed.priceSeriesByKey?.[priceKey];
    if (keyed) {
      for (let t = fromT; t <= toT; t += 1) {
        if (finite(keyed[t])) keyed[t] = (keyed[t] as number) * multiplier;
      }
    }
    if (metal === 'Au') {
      for (let t = fromT; t <= toT; t += 1) {
        if (finite(stressed.aisc.auPriceUSDPerOz[t])) stressed.aisc.auPriceUSDPerOz[t] = (stressed.aisc.auPriceUSDPerOz[t] as number) * multiplier;
      }
    }
  }
  return computeProjectEngineFullProductionV1(stressed);
}

function unavailableGate(reason: string): Tier1Gate {
  return { status: 'NOT_VERIFIED', tier: null, value: null, threshold: null, unit: null, reason };
}

function unavailableAssessment(diagnostics: string[]): Tier1PreRevenueAssessment {
  const reason = diagnostics[0] ?? 'Ej verifierad.';
  const unavailable = unavailableGate(reason);
  return {
    status: 'NOT_VERIFIED', classificationReason: reason,
    primaryMetal: null, primaryMetalRevenueShare: null,
    gates: { lom: unavailable, scale: unavailable, cost: unavailable, cycle: unavailable, capitalReturns: unavailable },
    support: {
      tierBasePriceMode: 'SPOT', tierBasePriceAsOfUtc: new Date().toISOString(),
      tierBaseNpv10Usd: null, tierBaseIrr: null, tierBaseNpvOverInitialCapex: null,
      cycleNpv10Usd: null, cycleDurationProductionPeriods: TIER1_POLICY.cycleDurationProductionPeriods,
      cycleMultipliersByMetal: {}, cycleMethod: null,
    },
    diagnostics,
  };
}

function equivalentAiscForMetal(
  preparedProjects: ProjectPrepared[],
  metal: 'Ag' | 'Zn',
  sustainingCostUsd: number,
): number | null {
  let equivalentQuantity = 0;
  for (const project of preparedProjects) {
    const priceKey = project.priceKeyByMetal[metal];
    if (!priceKey) return null;
    const price = project.basePriceByKey[priceKey];
    if (!finite(price) || price <= 0) return null;
    const canonicalUnit = getPriceKeyDefinition(priceKey).canonicalUnit;
    for (const revenue of project.baseOutput.revenue.grossRevenueUSD) {
      if (!finite(revenue) || revenue <= 0) continue;
      if (metal === 'Ag') {
        if (canonicalUnit !== 'USD_per_toz') return null;
        equivalentQuantity += revenue / price;
      } else if (canonicalUnit === 'USD_per_lb') {
        equivalentQuantity += revenue / price;
      } else if (canonicalUnit === 'USD_per_tonne') {
        equivalentQuantity += (revenue / price) * LB_PER_TONNE;
      } else {
        return null;
      }
    }
  }
  return equivalentQuantity > 0 ? sustainingCostUsd / equivalentQuantity : null;
}

function singlePhysicalMetal(quantityByMetalByYear: Map<string, Map<number, number>>): Tier1Metal | null {
  const metals = [...quantityByMetalByYear.entries()]
    .filter(([metal, byYear]) => isTier1Metal(metal) && [...byYear.values()].some((value) => finite(value) && value > 0))
    .map(([metal]) => metal as Tier1Metal);
  return metals.length === 1 ? metals[0] : null;
}

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  const symbol = String(req.query?.symbol ?? '').trim().toUpperCase();
  if (!symbol) {
    res.status(400).json({ ok: false, error: 'symbol is required' });
    return;
  }

  try {
    const loaded = await loadProjectsForSymbol(symbol);
    if (loaded.length === 0) {
      res.status(200).json({ ok: true, symbol, assessment: unavailableAssessment(['Inga project_json-projekt hittades.']) });
      return;
    }

    const diagnostics: string[] = [];
    const preparedProjects: ProjectPrepared[] = [];
    const revenueByMetalTotal: Record<string, number> = {};
    const quantityByMetalByYear = new Map<string, Map<number, number>>();
    const quantityUnitByMetal = new Map<string, 'toz' | 'tonne'>();
    const productionYears = new Set<number>();
    const tierBasePriceAsOfUtc = new Date().toISOString();
    let initialCapexUsd = 0;
    let sustainingCostUsd = 0;
    let auEqDenominatorOz = 0;
    let spotDeckComplete = true;

    for (const project of loaded) {
      const parsed = parseProjectJsonV1(project.rawJson);
      const physicalInput = parsed.engineInputWithoutPrices;
      const yearsByPeriod = physicalInput.yearsByPeriod;

      // Physical mine-plan gates use physical payable quantities and their
      // declared quantity units. Price keys must never determine scale units.
      for (const [metal, qtySeries] of Object.entries(physicalInput.payableQtyByMetal)) {
        if (!isTier1Metal(metal)) continue;
        const qtyUnit = physicalInput.payableQtyUnitByMetal[metal];
        for (let t = 0; t < qtySeries.length; t += 1) {
          const qty = qtySeries[t];
          if (!finite(qty) || qty <= 0) continue;
          const standard = standardPayableQuantity(metal, qtyUnit, qty);
          if (!standard) {
            diagnostics.push(`${project.projectId}: payable-enheten ${qtyUnit ?? 'saknas'} kan inte konverteras för ${metal}.`);
            continue;
          }
          const existingUnit = quantityUnitByMetal.get(metal);
          if (existingUnit && existingUnit !== standard.unit) {
            diagnostics.push(`${project.projectId}: inkonsekventa kanoniska payable-enheter för ${metal}.`);
            continue;
          }
          quantityUnitByMetal.set(metal, standard.unit);
          addToNestedMap(quantityByMetalByYear, metal, yearsByPeriod[t], standard.value);
          productionYears.add(yearsByPeriod[t]);
        }
      }

      let baseInput: Awaited<ReturnType<typeof resolveProjectPricesToEngineInput>>;
      try {
        baseInput = await resolveProjectPricesToEngineInput({
          parsed,
          scenario: { mode: 'spot' },
          allowRefresh: true,
          projectId: project.projectId,
        });
      } catch (error) {
        spotDeckComplete = false;
        diagnostics.push(`${project.projectId}: gemensamt Tier-spotdeck kunde inte lösas: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      const priceFailures = baseInput.diagnostics?.metalsWithPriceFailure ?? [];
      const basePriceByKey = resolvedSpotPriceByKey(baseInput, physicalInput.priceKeyByMetal);
      if (priceFailures.length > 0 || !basePriceByKey) {
        spotDeckComplete = false;
        diagnostics.push(`${project.projectId}: spotpris saknas eller är ogiltigt för ${priceFailures.length > 0 ? priceFailures.join(', ') : 'minst en price key'}; prisberoende Tier-kriterier lämnas Ej verifierade.`);
        continue;
      }
      for (const warning of baseInput.diagnostics?.warnings ?? []) diagnostics.push(`${project.projectId}: ${warning}`);

      const baseOutput = computeProjectEngineFullProductionV1(baseInput);
      const productionStartPeriod = physicalInput.productionStartPeriod;
      preparedProjects.push({
        projectId: project.projectId,
        yearsByPeriod,
        productionStartPeriod,
        priceKeyByMetal: physicalInput.priceKeyByMetal,
        basePriceByKey,
        baseInput,
        baseOutput,
      });

      for (let t = 0; t <= productionStartPeriod; t += 1) {
        const capex = baseOutput.capexUSD_used[t];
        if (finite(capex)) initialCapexUsd += capex;
      }
      for (const [metal, revenueSeries] of Object.entries(baseOutput.revenue.byMetalRevenueUSD)) {
        const revenue = revenueSeries.reduce<number>((sum, value) => sum + (finite(value) ? value : 0), 0);
        revenueByMetalTotal[metal] = (revenueByMetalTotal[metal] ?? 0) + revenue;
      }
      for (let t = 0; t < baseOutput.aisc.payableAuEqOz.length; t += 1) {
        const payable = baseOutput.aisc.payableAuEqOz[t];
        const cost = baseOutput.phase1.sustainingCostUSD[t];
        if (finite(cost)) sustainingCostUsd += cost;
        if (finite(payable) && payable > 0 && finite(cost)) auEqDenominatorOz += payable;
      }
    }

    const lomGate = assessLom(productionYears.size > 0 ? productionYears.size : null);
    const scaleWindow = bestSustainedScaleWindow(quantityByMetalByYear, productionYears);
    const windowLabel = scaleWindow.startYear !== null && scaleWindow.endYear !== null && scaleWindow.years !== null
      ? `${scaleWindow.years}-års fönster ${scaleWindow.startYear}–${scaleWindow.endYear}`
      : undefined;
    const scaleAssessment = assessCombinedScale(scaleWindow.averagesByMetal, windowLabel);
    const scaleGate = scaleAssessment.gate;

    if (!spotDeckComplete || preparedProjects.length !== loaded.length) {
      const priceReason = 'Gemensamt kanoniskt spot-deck saknas för minst ett projekt; prisberoende Tier-kriterier kan inte verifieras.';
      const fallbackPrimary = singlePhysicalMetal(quantityByMetalByYear);
      const gates = {
        lom: lomGate,
        scale: scaleGate,
        cost: unavailableGate(priceReason),
        cycle: unavailableGate(priceReason),
        capitalReturns: unavailableGate(priceReason),
      };
      const classification = classifyTier(gates);
      const assessment: Tier1PreRevenueAssessment = {
        status: classification.status,
        classificationReason: classification.reason,
        primaryMetal: fallbackPrimary,
        primaryMetalRevenueShare: fallbackPrimary ? 1 : null,
        gates,
        support: {
          tierBasePriceMode: 'SPOT',
          tierBasePriceAsOfUtc,
          tierBaseNpv10Usd: null,
          tierBaseIrr: null,
          tierBaseNpvOverInitialCapex: null,
          cycleNpv10Usd: null,
          cycleDurationProductionPeriods: TIER1_POLICY.cycleDurationProductionPeriods,
          cycleMultipliersByMetal: {},
          cycleMethod: null,
          averageAnnualPayableByMetal: scaleWindow.averagesByMetal,
          scaleEquivalentByMetal: scaleAssessment.equivalentByMetal,
          combinedScaleEquivalent: scaleAssessment.combinedEquivalent,
          scaleWindowStartYear: scaleWindow.startYear,
          scaleWindowEndYear: scaleWindow.endYear,
          scaleWindowYears: scaleWindow.years,
        },
        diagnostics,
      };
      res.status(200).json({ ok: true, symbol, assessment });
      return;
    }

    const totalRevenue = Object.values(revenueByMetalTotal).reduce<number>((sum, value) => sum + value, 0);
    const sortedRevenue = Object.entries(revenueByMetalTotal).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
    const primaryRaw = sortedRevenue[0]?.[0] ?? null;
    const primaryMetal: Tier1Metal | null = primaryRaw && isTier1Metal(primaryRaw) ? primaryRaw : singlePhysicalMetal(quantityByMetalByYear);
    const primaryMetalRevenueShare = primaryMetal && totalRevenue > 0
      ? (revenueByMetalTotal[primaryMetal] ?? 0) / totalRevenue
      : primaryMetal ? 1 : null;

    const baseCorporate = aggregateFcffByYear(preparedProjects.map((project) => ({ yearsByPeriod: project.yearsByPeriod, fcff: project.baseOutput.phase1.fcffUSD })));
    const basePhase2 = baseCorporate
      ? computeProjectPhase2({
          masterN: baseCorporate.fcff.length - 1,
          productionStartPeriod: firstProductionIndex(baseCorporate.years, productionYears),
          discountRate: 0.10,
          fcffUSD: baseCorporate.fcff,
        })
      : null;

    const cycleByPriceKey = new Map<string, Tier1CycleMultiplierResult>();
    const allPriceKeys = [...new Set(preparedProjects.flatMap((project) => Object.values(project.priceKeyByMetal)))];
    for (const priceKey of allPriceKeys) cycleByPriceKey.set(priceKey, await loadCycleMultiplier(priceKey));

    const missingCycle = [...cycleByPriceKey.entries()].filter(([, result]) => result.status !== 'COMPUTABLE' || result.multiplier === null);
    const multipliersByPriceKey: Record<string, number> = {};
    for (const [priceKey, result] of cycleByPriceKey.entries()) if (result.multiplier !== null) multipliersByPriceKey[priceKey] = result.multiplier;

    const stressedProjects = missingCycle.length === 0
      ? preparedProjects.map((project) => ({ yearsByPeriod: project.yearsByPeriod, output: applyBearCycle(project, multipliersByPriceKey) }))
      : [];
    const stressCorporate = missingCycle.length === 0 && stressedProjects.every((project) => project.output !== null)
      ? aggregateFcffByYear(stressedProjects.map((project) => ({ yearsByPeriod: project.yearsByPeriod, fcff: project.output!.phase1.fcffUSD })))
      : null;
    const stressPhase2 = stressCorporate
      ? computeProjectPhase2({
          masterN: stressCorporate.fcff.length - 1,
          productionStartPeriod: firstProductionIndex(stressCorporate.years, productionYears),
          discountRate: 0.10,
          fcffUSD: stressCorporate.fcff,
        })
      : null;
    if (missingCycle.length > 0) diagnostics.push(...missingCycle.map(([priceKey, result]) => `Cykel ${priceKey}: ${result.reason ?? 'Ej verifierad.'}`));

    const capitalReturnsGate = assessCapitalReturns(basePhase2?.irr ?? null);
    const costMetricValues: Partial<Record<Tier1CostMetric, number>> = {};
    const auAisc = auEqDenominatorOz > 0 ? sustainingCostUsd / auEqDenominatorOz : null;
    if (finite(auAisc)) costMetricValues.AISC_AU_USD_PER_TOZ = auAisc;
    const agEqAisc = equivalentAiscForMetal(preparedProjects, 'Ag', sustainingCostUsd);
    if (finite(agEqAisc)) costMetricValues.AISC_AGEQ_USD_PER_TOZ = agEqAisc;
    const znEqAisc = equivalentAiscForMetal(preparedProjects, 'Zn', sustainingCostUsd);
    if (finite(znEqAisc)) costMetricValues.AISC_ZNEQ_USD_PER_LB = znEqAisc;

    let costGate = assessCost({ primaryMetal, primaryMetalRevenueShare, costMetricValues, nowUtc: new Date().toISOString() });
    let selectedCostMetric: Tier1CostMetric | null = null;

    // Silver best-available fallback: the existing project engine already
    // computes AgEq AISC from the same sustaining-cost numerator and the gross
    // revenue-equivalent silver denominator. When no explicit reported
    // co-product Ag AISC exists, use that canonical economic output as an
    // explicitly labelled proxy against the primary-silver co-product curve.
    // This adds no project input and does not alter Project/Corporate economics.
    if (primaryMetal === 'Ag' && finite(agEqAisc) && (costGate.status === 'NOT_VERIFIED' || costGate.tier === null)) {
      const benchmark = TIER1_COST_BENCHMARKS.Ag;
      const proxyGate = assessCostAgainstBenchmark({
        primaryMetal: 'Ag',
        primaryMetalRevenueShare,
        metric: benchmark.metric,
        value: agEqAisc,
        benchmark,
        nowUtc: new Date().toISOString(),
      });
      proxyGate.reason = `Best available från befintlig ekonomisk modell: AgEq AISC ${agEqAisc.toFixed(2)} USD/toz används som silver-cost proxy mot S&P:s co-product Ag-kurva. Ingen extra project_json-data antas. ${proxyGate.reason}`;
      costGate = proxyGate;
      selectedCostMetric = 'AISC_AGEQ_USD_PER_TOZ';
      diagnostics.push(`Kostnad Ag: engine-baserad AgEq AISC ${agEqAisc.toFixed(4)} USD/toz används som best-available proxy mot Ag co-product-kurvan.`);
    }

    const cycleReason = missingCycle.length > 0
      ? `Saknar verifierbar lång historik för: ${missingCycle.map(([priceKey]) => priceKey).join(', ')}.`
      : undefined;
    const cycleGate = assessCycle(stressPhase2?.npvToday_USD ?? null, cycleReason);
    const gates = { lom: lomGate, scale: scaleGate, cost: costGate, cycle: cycleGate, capitalReturns: capitalReturnsGate };
    const classification = classifyTier(gates);

    const cycleMultipliersByMetal: Record<string, number> = {};
    for (const project of preparedProjects) {
      for (const [metal, priceKey] of Object.entries(project.priceKeyByMetal)) {
        const multiplier = multipliersByPriceKey[priceKey];
        if (finite(multiplier)) cycleMultipliersByMetal[metal] = multiplier;
      }
    }

    const benchmark = primaryMetal ? TIER1_COST_BENCHMARKS[primaryMetal] : null;
    if (!selectedCostMetric) selectedCostMetric = benchmark && finite(costMetricValues[benchmark.metric]) ? benchmark.metric : null;

    const assessment: Tier1PreRevenueAssessment = {
      status: classification.status,
      classificationReason: classification.reason,
      primaryMetal,
      primaryMetalRevenueShare,
      gates,
      support: {
        tierBasePriceMode: 'SPOT',
        tierBasePriceAsOfUtc,
        tierBaseNpv10Usd: basePhase2?.npvToday_USD ?? null,
        tierBaseIrr: basePhase2?.irr ?? null,
        tierBaseNpvOverInitialCapex: initialCapexUsd > 0 && finite(basePhase2?.npvToday_USD)
          ? (basePhase2!.npvToday_USD as number) / initialCapexUsd
          : null,
        cycleNpv10Usd: stressPhase2?.npvToday_USD ?? null,
        cycleDurationProductionPeriods: TIER1_POLICY.cycleDurationProductionPeriods,
        cycleMultipliersByMetal,
        cycleMethod: [...cycleByPriceKey.values()].find((result) => result.method)?.method ?? null,
        averageAnnualPayableByMetal: scaleWindow.averagesByMetal,
        scaleEquivalentByMetal: scaleAssessment.equivalentByMetal,
        combinedScaleEquivalent: scaleAssessment.combinedEquivalent,
        scaleWindowStartYear: scaleWindow.startYear,
        scaleWindowEndYear: scaleWindow.endYear,
        scaleWindowYears: scaleWindow.years,
        costMetric: selectedCostMetric,
        costMetricValue: selectedCostMetric ? costMetricValues[selectedCostMetric] ?? (selectedCostMetric === 'AISC_AGEQ_USD_PER_TOZ' ? agEqAisc : null) : null,
      },
      diagnostics,
    };

    res.status(200).json({ ok: true, symbol, assessment });
  } catch (error) {
    res.status(200).json({
      ok: true,
      symbol,
      assessment: unavailableAssessment([error instanceof Error ? error.message : String(error)]),
    });
  }
}
