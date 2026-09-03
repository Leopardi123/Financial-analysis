import { getPriceKeyDefinition } from '../../../lib/prices/keys.ts';
import { loadProjectsForSymbol } from '../../../lib/api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../../../lib/project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../../../lib/project/jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../../../lib/project/engineFullProductionV1.ts';
import { computeProjectPhase2 } from '../../../lib/project/phase2.ts';
import { computeTier1CyclePolicyForSymbol, TIER1_CYCLE_POLICY } from '../../../lib/tier1/cyclePolicyRuntime.ts';
import {
  TIER1_COST_BENCHMARKS,
  TIER1_POLICY,
  isTier1Metal,
  tierBandFromScaleEquivalent,
  type Tier1CostMetric,
  type Tier1Metal,
} from '../../../lib/tier1/config.ts';
import {
  bestSustainedTier1ScaleWindow,
  normalizeDiscoveredScaleQuantity,
  type Tier1ScaleWindow,
} from '../../../lib/tier1/scale.ts';
import {
  assessCapitalReturns,
  assessCost,
  assessLom,
  classifyTier,
  type Tier1Gate,
  type Tier1PreRevenueAssessment,
} from '../../../lib/tier1/preRevenue.ts';
import { assessForwardCapitalEfficiency, computeForwardCapitalEfficiency } from '../../../lib/tier1/forwardCapitalEfficiency.ts';

const LB_PER_TONNE = 2204.6226218487757;

type ProjectPrepared = {
  projectId: string;
  yearsByPeriod: number[];
  productionStartPeriod: number;
  priceKeyByMetal: Record<string, string>;
  basePriceByKey: Record<string, number>;
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

function aggregateSeriesByYear(projects: Array<{ yearsByPeriod: number[]; series: Array<number | null> }>, years: number[]): Array<number | null> | null {
  const byYear = new Map<number, number>();
  for (const project of projects) {
    if (project.series.length !== project.yearsByPeriod.length) return null;
    for (let t = 0; t < project.yearsByPeriod.length; t += 1) {
      const value = project.series[t];
      if (!finite(value)) return null;
      const year = project.yearsByPeriod[t];
      byYear.set(year, (byYear.get(year) ?? 0) + value);
    }
  }
  return years.map((year) => byYear.get(year) ?? 0);
}

function firstProductionIndex(years: number[], productionYears: Set<number>): number {
  const found = years.findIndex((year) => productionYears.has(year));
  return found >= 0 ? found : 0;
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
      tierBaseNpv10Usd: null, tierBaseIrr: null, tierBaseFce: null, tierBaseFutureCapitalPvUsd: null, capitalReturnsMetric: null, tierBaseNpvOverInitialCapex: null,
      cycleNpv10Usd: null, cycleDurationProductionPeriods: TIER1_CYCLE_POLICY.classificationStressYears,
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

function singlePhysicalProduct(quantityByProductByYear: Map<string, Map<number, number>>): string | null {
  const products = [...quantityByProductByYear.entries()]
    .filter(([, byYear]) => [...byYear.values()].some((value) => finite(value) && value > 0))
    .map(([product]) => product);
  return products.length === 1 ? products[0] : null;
}

function scaleGateFromWindow(scaleWindow: Tier1ScaleWindow, windowLabel?: string): Tier1Gate {
  if (!finite(scaleWindow.combinedEquivalent)) {
    return {
      status: 'NOT_VERIFIED', tier: null, value: null, threshold: TIER1_POLICY.tier1ScaleEquivalent,
      unit: 'scale-equivalent', reason: 'Ingen fysisk produkt med aktiverad Tier-scale-policy kunde verifieras.',
    };
  }
  const combined = scaleWindow.combinedEquivalent;
  const tier = tierBandFromScaleEquivalent(combined);
  const parts = Object.values(scaleWindow.products)
    .filter((row) => row.scored && finite(row.equivalent))
    .sort((a, b) => (b.equivalent as number) - (a.equivalent as number))
    .map((row) => `${row.product} ${(row.equivalent as number).toFixed(2)}x`);
  const band = tier === 1 ? 'Tier 1' : tier === 2 ? 'Tier 2' : 'Tier 3';
  const suffix = windowLabel ? ` · ${windowLabel}` : '';
  return {
    status: tier === 1 ? 'PASS' : 'FAIL',
    tier,
    value: combined,
    threshold: TIER1_POLICY.tier1ScaleEquivalent,
    unit: 'scale-equivalent',
    reason: `${parts.join(' + ')} = ${combined.toFixed(2)}x · ${band}${suffix}. Tier 1 ≥1,00x; Tier 2 ≥0,40x; Tier 3 <0,40x.`,
  };
}

function legacyScaleSupport(scaleWindow: Tier1ScaleWindow): {
  averageAnnualPayableByMetal: Partial<Record<Tier1Metal, number>>;
  scaleEquivalentByMetal: Partial<Record<Tier1Metal, number>>;
} {
  const averageAnnualPayableByMetal: Partial<Record<Tier1Metal, number>> = {};
  const scaleEquivalentByMetal: Partial<Record<Tier1Metal, number>> = {};
  for (const [product, row] of Object.entries(scaleWindow.products)) {
    if (!isTier1Metal(product)) continue;
    if (finite(row.normalizedQuantity)) averageAnnualPayableByMetal[product] = row.normalizedQuantity;
    if (finite(row.equivalent)) scaleEquivalentByMetal[product] = row.equivalent;
  }
  return { averageAnnualPayableByMetal, scaleEquivalentByMetal };
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
    const quantityByProductByYear = new Map<string, Map<number, number>>();
    const quantityUnitByProduct = new Map<string, string>();
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

      for (const [product, qtySeries] of Object.entries(physicalInput.payableQtyByMetal)) {
        const qtyUnit = physicalInput.payableQtyUnitByMetal[product];
        if (!qtyUnit) {
          diagnostics.push(`${project.projectId}: payable-enhet saknas för fysisk produkt ${product}.`);
          continue;
        }
        for (let t = 0; t < qtySeries.length; t += 1) {
          const qty = qtySeries[t];
          if (!finite(qty) || qty <= 0) continue;
          const normalized = normalizeDiscoveredScaleQuantity({ product, value: qty, unit: qtyUnit });
          if (!normalized) {
            diagnostics.push(`${project.projectId}: payable-enheten ${qtyUnit} kan inte dimensionssäkert normaliseras för fysisk produkt ${product}.`);
            continue;
          }
          const existingUnit = quantityUnitByProduct.get(product);
          if (existingUnit && existingUnit !== normalized.unit) {
            diagnostics.push(`${project.projectId}: inkonsekventa normaliserade payable-enheter för ${product}.`);
            continue;
          }
          quantityUnitByProduct.set(product, normalized.unit);
          addToNestedMap(quantityByProductByYear, product, yearsByPeriod[t], normalized.value);
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
    const scaleWindow = bestSustainedTier1ScaleWindow({
      quantityByProductByYear,
      unitByProduct: quantityUnitByProduct,
      productionYears,
      sustainedScaleYears: TIER1_POLICY.sustainedScaleYears,
    });
    const windowLabel = scaleWindow.startYear !== null && scaleWindow.endYear !== null && scaleWindow.years !== null
      ? `${scaleWindow.years}-års fönster ${scaleWindow.startYear}–${scaleWindow.endYear}`
      : undefined;
    const scaleGate = scaleGateFromWindow(scaleWindow, windowLabel);
    const legacyScale = legacyScaleSupport(scaleWindow);
    const singleProduct = singlePhysicalProduct(quantityByProductByYear);

    if (!spotDeckComplete || preparedProjects.length !== loaded.length) {
      const priceReason = 'Gemensamt kanoniskt spot-deck saknas för minst ett projekt; prisberoende Tier-kriterier kan inte verifieras.';
      const fallbackPrimary = singleProduct && isTier1Metal(singleProduct) ? singleProduct : null;
      const gates = {
        lom: lomGate,
        scale: scaleGate,
        cost: unavailableGate(priceReason),
        cycle: unavailableGate(priceReason),
        capitalReturns: unavailableGate(priceReason),
      };
      const classification = classifyTier(gates);
      const support = {
        tierBasePriceMode: 'SPOT' as const,
        tierBasePriceAsOfUtc,
        tierBaseNpv10Usd: null,
        tierBaseIrr: null,
        tierBaseFce: null,
        tierBaseFutureCapitalPvUsd: null,
        capitalReturnsMetric: null,
        tierBaseNpvOverInitialCapex: null,
        cycleNpv10Usd: null,
        cycleDurationProductionPeriods: TIER1_CYCLE_POLICY.classificationStressYears,
        cycleMultipliersByMetal: {},
        cycleMethod: null,
        averageAnnualPayableByMetal: legacyScale.averageAnnualPayableByMetal,
        scaleEquivalentByMetal: legacyScale.scaleEquivalentByMetal,
        combinedScaleEquivalent: scaleWindow.combinedEquivalent,
        scaleWindowStartYear: scaleWindow.startYear,
        scaleWindowEndYear: scaleWindow.endYear,
        scaleWindowYears: scaleWindow.years,
        scaleProducts: scaleWindow.products,
        primaryProduct: singleProduct,
        primaryProductRevenueShare: singleProduct ? 1 : null,
      };
      const assessment: Tier1PreRevenueAssessment = {
        status: classification.status,
        classificationReason: classification.reason,
        primaryMetal: fallbackPrimary,
        primaryMetalRevenueShare: fallbackPrimary ? 1 : null,
        gates,
        support,
        diagnostics,
      };
      res.status(200).json({ ok: true, symbol, assessment });
      return;
    }

    const totalRevenue = Object.values(revenueByMetalTotal).reduce<number>((sum, value) => sum + value, 0);
    const sortedRevenue = Object.entries(revenueByMetalTotal).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
    const primaryProduct = sortedRevenue[0]?.[0] ?? singleProduct;
    const primaryProductRevenueShare = primaryProduct && totalRevenue > 0
      ? (revenueByMetalTotal[primaryProduct] ?? 0) / totalRevenue
      : primaryProduct ? 1 : null;
    const primaryMetal: Tier1Metal | null = primaryProduct && isTier1Metal(primaryProduct) ? primaryProduct : null;
    const primaryMetalRevenueShare = primaryMetal ? primaryProductRevenueShare : null;

    const baseCorporate = aggregateFcffByYear(preparedProjects.map((project) => ({ yearsByPeriod: project.yearsByPeriod, fcff: project.baseOutput.phase1.fcffUSD })));
    const basePhase2 = baseCorporate
      ? computeProjectPhase2({
          masterN: baseCorporate.fcff.length - 1,
          productionStartPeriod: firstProductionIndex(baseCorporate.years, productionYears),
          discountRate: 0.10,
          fcffUSD: baseCorporate.fcff,
        })
      : null;

    const cyclePolicy = await computeTier1CyclePolicyForSymbol(symbol);
    diagnostics.push(...cyclePolicy.diagnostics);
    diagnostics.push(`Cykelresistens aktiv policy: ${cyclePolicy.method} Corporate projectCount=${cyclePolicy.projectCount}.`);

    const producingAtFirstCorporatePeriod = baseCorporate !== null
      && productionYears.has(baseCorporate.years[0]);
    const futureCapitalByYear = baseCorporate === null ? null : aggregateSeriesByYear(
      preparedProjects.map((project) => ({
        yearsByPeriod: project.yearsByPeriod,
        series: project.baseOutput.capexUSD_used.map((capex, t) => {
          const sustaining = project.baseInput.phase1.sustainingCapexUSD[t];
          const closure = project.baseInput.phase1.reclamationUSD[t];
          return finite(capex) && finite(sustaining) && finite(closure) ? capex + sustaining + closure : null;
        }),
      })),
      baseCorporate.years,
    );
    const fce = producingAtFirstCorporatePeriod && baseCorporate !== null && futureCapitalByYear !== null
      ? computeForwardCapitalEfficiency({ fcffUSD: baseCorporate.fcff, futureCapitalUSD: futureCapitalByYear, discountRate: 0.10 })
      : { value: null, npvUSD: null, futureCapitalPvUSD: null, reason: 'FCE är N/A när portföljen inte producerar i första aggregerade modellperioden.' };
    const capitalReturnsGate = producingAtFirstCorporatePeriod
      ? assessForwardCapitalEfficiency(fce.value)
      : assessCapitalReturns(basePhase2?.irr ?? null);
    diagnostics.push(producingAtFirstCorporatePeriod
      ? `Kapitalavkastning: FCE vid spot används eftersom portföljen producerar i första aggregerade perioden; NPV10=${String(fce.npvUSD)} / PV framtida total-CAPEX inklusive sustaining och closure=${String(fce.futureCapitalPvUSD)}.`
      : 'Kapitalavkastning: after-tax IRR vid spot används; FCE är N/A eftersom portföljen inte producerar i första aggregerade perioden.');
    const costMetricValues: Partial<Record<Tier1CostMetric, number>> = {};
    const auAisc = auEqDenominatorOz > 0 ? sustainingCostUsd / auEqDenominatorOz : null;
    if (finite(auAisc)) costMetricValues.AISC_AU_USD_PER_TOZ = auAisc;
    const agEqAisc = equivalentAiscForMetal(preparedProjects, 'Ag', sustainingCostUsd);
    if (finite(agEqAisc)) costMetricValues.AISC_AGEQ_USD_PER_TOZ = agEqAisc;
    const znEqAisc = equivalentAiscForMetal(preparedProjects, 'Zn', sustainingCostUsd);
    if (finite(znEqAisc)) costMetricValues.AISC_ZNEQ_USD_PER_LB = znEqAisc;

    const costGate = assessCost({ primaryMetal, primaryMetalRevenueShare, costMetricValues, nowUtc: new Date().toISOString() });
    let selectedCostMetric: Tier1CostMetric | null = null;

    if (primaryMetal === 'Ag' && finite(agEqAisc) && (costGate.status === 'NOT_VERIFIED' || costGate.tier === null)) {
      diagnostics.push(`Kostnad Ag: engine-baserad AgEq AISC ${agEqAisc.toFixed(4)} USD/toz bevaras som cost evidence men jämförs inte med S&P:s co-product Ag AISC-kurva utan definitionskompatibel metric.`);
    }
    if (primaryProduct && !primaryMetal) {
      diagnostics.push(`Primär fysisk/economisk produkt ${primaryProduct} saknar definitionskompatibel Tier cost-policy; kostnads-Tier lämnas Ej verifierad.`);
    }

    const gates = { lom: lomGate, scale: scaleGate, cost: costGate, cycle: cyclePolicy.gate, capitalReturns: capitalReturnsGate };
    const classification = classifyTier(gates);

    const benchmark = primaryMetal ? TIER1_COST_BENCHMARKS[primaryMetal] : null;
    if (!selectedCostMetric) selectedCostMetric = benchmark && finite(costMetricValues[benchmark.metric]) ? benchmark.metric : null;

    const support = {
      tierBasePriceMode: 'SPOT' as const,
      tierBasePriceAsOfUtc,
      tierBaseNpv10Usd: basePhase2?.npvToday_USD ?? null,
      tierBaseIrr: producingAtFirstCorporatePeriod ? null : basePhase2?.irr ?? null,
      tierBaseFce: producingAtFirstCorporatePeriod ? fce.value : null,
      tierBaseFutureCapitalPvUsd: producingAtFirstCorporatePeriod ? fce.futureCapitalPvUSD : null,
      capitalReturnsMetric: producingAtFirstCorporatePeriod ? 'FCE' as const : 'IRR' as const,
      tierBaseNpvOverInitialCapex: initialCapexUsd > 0 && finite(basePhase2?.npvToday_USD)
        ? (basePhase2!.npvToday_USD as number) / initialCapexUsd
        : null,
      cycleNpv10Usd: cyclePolicy.stressNpv10Usd,
      cycleDurationProductionPeriods: TIER1_CYCLE_POLICY.classificationStressYears,
      cycleMultipliersByMetal: cyclePolicy.multipliersByMetal,
      cycleMethod: cyclePolicy.method,
      cycleBaseRevenueUsd: cyclePolicy.baseRevenueUsd,
      cycleStressRevenueUsd: cyclePolicy.stressRevenueUsd,
      cycleRevenueRetention: cyclePolicy.revenueRetention,
      cycleNpvRetention: cyclePolicy.npvRetention,
      cycleDownsideBeta: cyclePolicy.downsideBeta,
      cycleStressIrr: cyclePolicy.stressIrr,
      cycleSurvivalNpv10Usd: cyclePolicy.survivalNpv10Usd,
      cycleSurvivalProductionPeriods: TIER1_CYCLE_POLICY.survivalStressYears,
      cycleProjectCount: cyclePolicy.projectCount,
      averageAnnualPayableByMetal: legacyScale.averageAnnualPayableByMetal,
      scaleEquivalentByMetal: legacyScale.scaleEquivalentByMetal,
      combinedScaleEquivalent: scaleWindow.combinedEquivalent,
      scaleWindowStartYear: scaleWindow.startYear,
      scaleWindowEndYear: scaleWindow.endYear,
      scaleWindowYears: scaleWindow.years,
      scaleProducts: scaleWindow.products,
      primaryProduct,
      primaryProductRevenueShare,
      costMetric: selectedCostMetric,
      costMetricValue: selectedCostMetric ? costMetricValues[selectedCostMetric] ?? null : null,
    };

    const assessment: Tier1PreRevenueAssessment = {
      status: classification.status,
      classificationReason: classification.reason,
      primaryMetal,
      primaryMetalRevenueShare,
      gates,
      support,
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
