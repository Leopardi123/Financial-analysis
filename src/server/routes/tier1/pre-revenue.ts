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
  TIER1_POLICY,
  isTier1Metal,
  type Tier1Metal,
} from '../../../lib/tier1/config.ts';
import {
  assessCapitalReturns,
  assessCost,
  assessCycle,
  assessLom,
  assessScale,
  combineTier1GateStatuses,
  type Tier1PreRevenueAssessment,
} from '../../../lib/tier1/preRevenue.ts';

const LB_PER_TONNE = 2204.6226218487757;

type ProjectPrepared = {
  projectId: string;
  yearsByPeriod: number[];
  productionStartPeriod: number;
  priceKeyByMetal: Record<string, string>;
  fixedPriceByKey: Record<string, number>;
  baseInput: Awaited<ReturnType<typeof resolveProjectPricesToEngineInput>>;
  baseOutput: ReturnType<typeof computeProjectEngineFullProductionV1>;
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

function reportFixedDeck(parsed: ReturnType<typeof parseProjectJsonV1>): Record<string, number> | null {
  const overrides = parsed.priceOverrides.spotPriceUSDByMetal;
  if (!overrides) return null;
  const fixed: Record<string, number> = {};
  for (const metal of Object.keys(parsed.engineInputWithoutPrices.payableQtyByMetal)) {
    const priceKey = parsed.engineInputWithoutPrices.priceKeyByMetal[metal];
    const price = scalarPrice(overrides[metal]);
    if (!priceKey || price === null) return null;
    fixed[priceKey] = price;
  }
  return fixed;
}

function addToNestedMap(target: Map<string, Map<number, number>>, key: string, year: number, value: number): void {
  const byYear = target.get(key) ?? new Map<number, number>();
  byYear.set(year, (byYear.get(year) ?? 0) + value);
  target.set(key, byYear);
}

function standardPayableQuantity(priceKey: string, value: number): { value: number; unit: 'toz' | 'tonne' } | null {
  const unit = getPriceKeyDefinition(priceKey).canonicalUnit;
  if (unit === 'USD_per_toz') return { value, unit: 'toz' };
  if (unit === 'USD_per_tonne') return { value, unit: 'tonne' };
  if (unit === 'USD_per_lb') return { value: value / LB_PER_TONNE, unit: 'tonne' };
  return null;
}

function sumFinite(series: Array<number | null>): number | null {
  let total = 0;
  for (const value of series) {
    if (!finite(value)) return null;
    total += value;
  }
  return total;
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
        status: 'NOT_VERIFIED',
        multiplier: null,
        monthlyObservations: monthlyCount,
        ratioObservations: 0,
        method: `P${Math.round(TIER1_POLICY.cyclePercentile * 100)} relative bear model`,
        reason: `History refresh failed for ${priceKey}: ${error instanceof Error ? error.message : String(error)}`,
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
        if (finite(stressed.aisc.auPriceUSDPerOz[t])) {
          stressed.aisc.auPriceUSDPerOz[t] = (stressed.aisc.auPriceUSDPerOz[t] as number) * multiplier;
        }
      }
    }
  }

  return computeProjectEngineFullProductionV1(stressed);
}

function unavailableAssessment(diagnostics: string[]): Tier1PreRevenueAssessment {
  const unavailable = { status: 'NOT_VERIFIED' as const, value: null, threshold: null, unit: null, reason: diagnostics[0] ?? 'Ej verifierad.' };
  return {
    status: 'NOT_VERIFIED',
    primaryMetal: null,
    primaryMetalRevenueShare: null,
    gates: { lom: unavailable, scale: unavailable, cost: unavailable, cycle: unavailable, capitalReturns: unavailable },
    support: {
      reportBaseNpv10Usd: null,
      reportBaseIrr: null,
      reportBaseNpvOverInitialCapex: null,
      cycleNpv10Usd: null,
      cycleDurationProductionPeriods: TIER1_POLICY.cycleDurationProductionPeriods,
      cycleMultipliersByMetal: {},
      cycleMethod: null,
    },
    diagnostics,
  };
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
    let initialCapexUsd = 0;
    let aiscNumerator = 0;
    let aiscDenominator = 0;
    let reportDeckComplete = true;

    for (const project of loaded) {
      const parsed = parseProjectJsonV1(project.rawJson);
      const fixedPriceByKey = reportFixedDeck(parsed);
      if (!fixedPriceByKey) {
        reportDeckComplete = false;
        diagnostics.push(`${project.projectId}: rapportens prisdeck saknas eller är inte ett entydigt konstant priceOverrides-deck; kapital/cykel kan inte verifieras.`);
        continue;
      }
      const yearsByPeriod = parsed.engineInputWithoutPrices.yearsByPeriod;
      const from = `${yearsByPeriod[0]}-12-31`;
      const to = `${yearsByPeriod[yearsByPeriod.length - 1]}-12-31`;
      const baseInput = await resolveProjectPricesToEngineInput({
        parsed,
        scenario: { mode: 'fixed', fixedPriceByKey },
        from,
        to,
        allowRefresh: false,
        projectId: project.projectId,
      });
      const baseOutput = computeProjectEngineFullProductionV1(baseInput);
      const productionStartPeriod = parsed.engineInputWithoutPrices.productionStartPeriod;

      preparedProjects.push({
        projectId: project.projectId,
        yearsByPeriod,
        productionStartPeriod,
        priceKeyByMetal: parsed.engineInputWithoutPrices.priceKeyByMetal,
        fixedPriceByKey,
        baseInput,
        baseOutput,
      });

      for (let t = 0; t <= productionStartPeriod; t += 1) {
        const capex = baseOutput.capexUSD_used[t];
        if (finite(capex)) initialCapexUsd += capex;
      }

      for (const [metal, revenueSeries] of Object.entries(baseOutput.revenue.byMetalRevenueUSD)) {
        const revenue = revenueSeries.reduce((sum, value) => sum + (finite(value) ? value : 0), 0);
        revenueByMetalTotal[metal] = (revenueByMetalTotal[metal] ?? 0) + revenue;
      }

      for (const [metal, qtySeries] of Object.entries(baseInput.payableQtyByMetal)) {
        const priceKey = parsed.engineInputWithoutPrices.priceKeyByMetal[metal];
        if (!priceKey) continue;
        for (let t = 0; t < qtySeries.length; t += 1) {
          const qty = qtySeries[t];
          if (!finite(qty) || qty <= 0) continue;
          const standard = standardPayableQuantity(priceKey, qty);
          if (!standard) continue;
          const existingUnit = quantityUnitByMetal.get(metal);
          if (existingUnit && existingUnit !== standard.unit) {
            diagnostics.push(`${project.projectId}: inconsistent canonical payable units for ${metal}.`);
            continue;
          }
          quantityUnitByMetal.set(metal, standard.unit);
          addToNestedMap(quantityByMetalByYear, metal, yearsByPeriod[t], standard.value);
          productionYears.add(yearsByPeriod[t]);
        }
      }

      for (let t = 0; t < baseOutput.aisc.payableAuEqOz.length; t += 1) {
        const payable = baseOutput.aisc.payableAuEqOz[t];
        if (!finite(payable) || payable <= 0) continue;
        const cost = baseOutput.phase1.sustainingCostUSD[t];
        if (!finite(cost)) continue;
        aiscNumerator += cost;
        aiscDenominator += payable;
      }
    }

    if (!reportDeckComplete || preparedProjects.length !== loaded.length) {
      const lomGate = assessLom(productionYears.size > 0 ? productionYears.size : null);
      const assessment = unavailableAssessment(diagnostics.length > 0 ? diagnostics : ['Rapportens prisdeck kunde inte verifieras.']);
      assessment.gates.lom = lomGate;
      res.status(200).json({ ok: true, symbol, assessment });
      return;
    }

    const totalRevenue = Object.values(revenueByMetalTotal).reduce((sum, value) => sum + value, 0);
    const sortedRevenue = Object.entries(revenueByMetalTotal).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
    const primaryRaw = sortedRevenue[0]?.[0] ?? null;
    const primaryMetal: Tier1Metal | null = primaryRaw && isTier1Metal(primaryRaw) ? primaryRaw : null;
    const primaryMetalRevenueShare = primaryMetal && totalRevenue > 0 ? (revenueByMetalTotal[primaryMetal] ?? 0) / totalRevenue : null;

    const primaryByYear = primaryMetal ? quantityByMetalByYear.get(primaryMetal) : null;
    const primaryValues = primaryByYear ? [...primaryByYear.values()].filter((value) => finite(value) && value > 0) : [];
    const averageAnnualPayable = primaryValues.length > 0
      ? primaryValues.reduce((sum, value) => sum + value, 0) / primaryValues.length
      : null;

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
    for (const priceKey of allPriceKeys) {
      cycleByPriceKey.set(priceKey, await loadCycleMultiplier(priceKey));
    }

    const missingCycle = [...cycleByPriceKey.entries()].filter(([, result]) => result.status !== 'COMPUTABLE' || result.multiplier === null);
    const multipliersByPriceKey: Record<string, number> = {};
    for (const [priceKey, result] of cycleByPriceKey.entries()) {
      if (result.multiplier !== null) multipliersByPriceKey[priceKey] = result.multiplier;
    }

    const stressedProjects = missingCycle.length === 0
      ? preparedProjects.map((project) => ({
          yearsByPeriod: project.yearsByPeriod,
          output: applyBearCycle(project, multipliersByPriceKey),
        }))
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

    if (missingCycle.length > 0) {
      diagnostics.push(...missingCycle.map(([priceKey, result]) => `Cycle ${priceKey}: ${result.reason ?? 'Ej verifierad.'}`));
    }

    const lomGate = assessLom(productionYears.size > 0 ? productionYears.size : null);
    const scaleGate = assessScale({ primaryMetal, averageAnnualPayable });
    const capitalReturnsGate = assessCapitalReturns(basePhase2?.irr ?? null);
    const aiscAuEqUsdPerOz = aiscDenominator > 0 ? aiscNumerator / aiscDenominator : null;
    const costGate = assessCost({
      primaryMetal,
      primaryMetalRevenueShare,
      aiscAuEqUsdPerOz,
      nowUtc: new Date().toISOString(),
    });
    const cycleReason = missingCycle.length > 0
      ? `Saknar verifierbar historik för: ${missingCycle.map(([priceKey]) => priceKey).join(', ')}.`
      : undefined;
    const cycleGate = assessCycle(stressPhase2?.npvToday_USD ?? null, cycleReason);

    const gates = { lom: lomGate, scale: scaleGate, cost: costGate, cycle: cycleGate, capitalReturns: capitalReturnsGate };
    const cycleMultipliersByMetal: Record<string, number> = {};
    for (const project of preparedProjects) {
      for (const [metal, priceKey] of Object.entries(project.priceKeyByMetal)) {
        const multiplier = multipliersByPriceKey[priceKey];
        if (finite(multiplier)) cycleMultipliersByMetal[metal] = multiplier;
      }
    }

    const assessment: Tier1PreRevenueAssessment = {
      status: combineTier1GateStatuses(gates),
      primaryMetal,
      primaryMetalRevenueShare,
      gates,
      support: {
        reportBaseNpv10Usd: basePhase2?.npvToday_USD ?? null,
        reportBaseIrr: basePhase2?.irr ?? null,
        reportBaseNpvOverInitialCapex: initialCapexUsd > 0 && finite(basePhase2?.npvToday_USD)
          ? (basePhase2!.npvToday_USD as number) / initialCapexUsd
          : null,
        cycleNpv10Usd: stressPhase2?.npvToday_USD ?? null,
        cycleDurationProductionPeriods: TIER1_POLICY.cycleDurationProductionPeriods,
        cycleMultipliersByMetal,
        cycleMethod: [...cycleByPriceKey.values()].find((result) => result.method)?.method ?? null,
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
