import preRevenueHandler from '../src/server/routes/tier1/pre-revenue.ts';
import { loadProjectsForSymbol } from '../src/lib/api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../src/lib/project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../src/lib/project/jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../src/lib/project/engineFullProductionV1.ts';
import { computeIrr } from '../src/lib/metrics/lista3.ts';
import {
  TIER1_COST_BENCHMARKS,
  type Tier1CostBasisId,
  type Tier1CostMetric,
  type Tier1Metal,
} from '../src/lib/tier1/config.ts';
import { assessCapitalReturns, assessCost, classifyTier } from '../src/lib/tier1/preRevenue.ts';
import { selectConservativeProjectIrr, type ProjectIrrObservation } from '../src/lib/tier1/projectIrr.ts';
import {
  canonicalCostMetricForPrimaryMetal,
  costVintageCompatibility,
  type CanonicalCostResult,
} from '../src/lib/tier1/cost.ts';
import { buildTierCyclePriceDisplay } from '../src/server/routes/tier1/cycle-price-display.ts';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function canonicalCostBasisForMetal(metal: Tier1Metal): Tier1CostBasisId | null {
  if (metal === 'Cu') return 'S_AND_P_CO_PRODUCT_C1_CU';
  if (metal === 'Ni') return 'JAGUAR_NI_C1_MINE_SITE_GA';
  return null;
}

async function computeProjectIrrObservations(symbol: string): Promise<ProjectIrrObservation[]> {
  const loaded = await loadProjectsForSymbol(symbol);
  const observations: ProjectIrrObservation[] = [];

  for (const project of loaded) {
    const parsed = parseProjectJsonV1(project.rawJson);
    const input = await resolveProjectPricesToEngineInput({
      parsed,
      scenario: { mode: 'spot' },
      allowRefresh: true,
      projectId: project.projectId,
    });
    const output = computeProjectEngineFullProductionV1(input);
    const fcff = output.phase1.fcffUSD;
    const allFinite = fcff.every((value) => finite(value));
    const hasNegativeCashFlow = fcff.some((value) => finite(value) && value < 0);
    const hasPositiveCashFlow = fcff.some((value) => finite(value) && value > 0);
    const irr = allFinite ? computeIrr(fcff, 0.10).selectedRoot : null;
    observations.push({ projectId: project.projectId, irr, hasNegativeCashFlow, hasPositiveCashFlow });
  }

  return observations;
}

type CompanyCanonicalCost = CanonicalCostResult & {
  projectDetails: string[];
  basisId: Tier1CostBasisId | null;
};

async function computeCanonicalCompanyCost(symbol: string, primaryMetal: Tier1Metal): Promise<CompanyCanonicalCost> {
  const loaded = await loadProjectsForSymbol(symbol);
  const results: Array<{ projectId: string; result: CanonicalCostResult }> = [];
  const basisId = canonicalCostBasisForMetal(primaryMetal);

  for (const project of loaded) {
    const parsed = parseProjectJsonV1(project.rawJson);
    const payable = parsed.engineInputWithoutPrices.payableQtyByMetal[primaryMetal] ?? [];
    if (!payable.some((value) => finite(value) && value > 0)) continue;

    const input = await resolveProjectPricesToEngineInput({
      parsed,
      scenario: { mode: 'spot' },
      allowRefresh: true,
      projectId: project.projectId,
    });
    const output = computeProjectEngineFullProductionV1(input);
    const phase1 = parsed.engineInputWithoutPrices.phase1;
    const unknownCredits = new Array<number | null>(parsed.engineInputWithoutPrices.masterN + 1).fill(null);
    const result = canonicalCostMetricForPrimaryMetal({
      projectId: project.projectId,
      primaryMetal,
      productionStartPeriod: parsed.engineInputWithoutPrices.productionStartPeriod,
      masterN: parsed.engineInputWithoutPrices.masterN,
      payableQtyByMetal: parsed.engineInputWithoutPrices.payableQtyByMetal,
      payableQtyUnitByMetal: parsed.engineInputWithoutPrices.payableQtyUnitByMetal,
      operatingCostsUSD: phase1.operatingCostsUSD,
      siteGandA_USD: phase1.siteGandA_USD,
      byproductCreditsUSD: phase1.byproductCreditsUSD ?? unknownCredits,
      economicsBreakdown: parsed.context.economicsBreakdown as any,
      revenueByMetalUSD: output.revenue.byMetalRevenueUSD,
      rawJson: project.rawJson,
    });
    results.push({ projectId: project.projectId, result });
  }

  if (results.length === 0) {
    return {
      status: 'NOT_VERIFIED', metric: null, value: null, unit: null, numeratorUSD: null, denominator: null,
      costBaseYear: null, reason: `Inget projekt med payable ${primaryMetal} hittades för canonical cost bridge.`, diagnostics: [], projectDetails: [], basisId,
    };
  }

  const unresolved = results.filter(({ result }) => result.status !== 'COMPUTABLE');
  if (unresolved.length > 0) {
    return {
      status: 'NOT_VERIFIED',
      metric: unresolved[0].result.metric,
      value: null,
      unit: unresolved[0].result.unit,
      numeratorUSD: null,
      denominator: null,
      costBaseYear: unresolved[0].result.costBaseYear,
      reason: unresolved.map(({ projectId, result }) => `${projectId}: ${result.reason}`).join(' · '),
      diagnostics: unresolved.flatMap(({ projectId, result }) => result.diagnostics.map((item) => `${projectId}: ${item}`)),
      projectDetails: results.map(({ projectId, result }) => `${projectId}: ${result.status}`),
      basisId,
    };
  }

  const computed = results.map(({ projectId, result }) => ({ projectId, result: result as CanonicalCostResult & { status: 'COMPUTABLE'; value: number; numeratorUSD: number; denominator: number } }));
  const metrics = new Set(computed.map(({ result }) => result.metric));
  const years = new Set(computed.map(({ result }) => result.costBaseYear));
  if (metrics.size !== 1 || years.size !== 1) {
    return {
      status: 'NOT_VERIFIED', metric: computed[0].result.metric, value: null, unit: computed[0].result.unit,
      numeratorUSD: null, denominator: null, costBaseYear: null,
      reason: 'Flerprojektsbolaget har inkompatibla canonical cost metrics eller kostnadsbasår; ingen implicit sammanvägning görs.',
      diagnostics: [], projectDetails: computed.map(({ projectId, result }) => `${projectId}: ${result.metric}, basår ${String(result.costBaseYear)}`), basisId,
    };
  }

  const numeratorUSD = computed.reduce((sum, { result }) => sum + result.numeratorUSD, 0);
  const denominator = computed.reduce((sum, { result }) => sum + result.denominator, 0);
  return {
    status: 'COMPUTABLE',
    metric: computed[0].result.metric,
    value: denominator > 0 ? numeratorUSD / denominator : null,
    unit: computed[0].result.unit,
    numeratorUSD,
    denominator,
    costBaseYear: computed[0].result.costBaseYear,
    reason: computed[0].result.reason,
    diagnostics: computed.flatMap(({ projectId, result }) => result.diagnostics.map((item) => `${projectId}: ${item}`)),
    projectDetails: computed.map(({ projectId, result }) => `${projectId}: ${result.value.toFixed(4)} ${result.unit ?? ''}`),
    basisId,
  };
}

function applyCanonicalCostGate(assessment: any, cost: CompanyCanonicalCost): void {
  const primaryMetal = assessment.primaryMetal as Tier1Metal | null;
  if (!primaryMetal) return;
  const benchmark = TIER1_COST_BENCHMARKS[primaryMetal];
  const diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
  assessment.diagnostics = diagnostics;
  diagnostics.push(...cost.diagnostics.map((item) => `Kostnad: ${item}`));

  assessment.support.costMetric = cost.metric;
  assessment.support.costMetricValue = cost.value;
  assessment.support.costBaseYear = cost.costBaseYear;
  assessment.support.costBasisId = cost.basisId;
  assessment.support.costBenchmarkBasisId = benchmark.basisId;
  assessment.support.costMethod = cost.status === 'COMPUTABLE' ? 'CANONICAL_COST_V1' : 'NOT_VERIFIED';
  assessment.support.costProjectDetails = cost.projectDetails;

  if (!benchmark.comparisonEnabled) {
    const reason = `Kostnadsreferensen för ${primaryMetal} är endast informativ: dess definitionsbasis (${benchmark.basisId}) är inte homogen med den nuvarande projektmetriken. Ingen Tier-klassificering görs från denna referens.`;
    assessment.gates.cost = {
      status: 'NOT_VERIFIED', tier: null, value: finite(cost.value) ? cost.value : null,
      threshold: benchmark.q1Max, unit: benchmark.unit, reason,
    };
    diagnostics.push(`Kostnad: ${reason}`);
    return;
  }

  if (cost.status !== 'COMPUTABLE' || !cost.metric || !finite(cost.value)) {
    assessment.gates.cost = {
      status: 'NOT_VERIFIED', tier: null, value: finite(cost.value) ? cost.value : null,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: cost.reason,
    };
    diagnostics.push(`Kostnad: ${cost.reason}`);
    return;
  }

  if (!cost.basisId || cost.basisId !== benchmark.basisId) {
    const reason = `Canonical cost-basis ${cost.basisId ?? 'saknas'} matchar inte benchmarkens ${benchmark.basisId}. Ingen implicit definitionskonvertering görs.`;
    assessment.gates.cost = {
      status: 'NOT_VERIFIED', tier: null, value: cost.value,
      threshold: benchmark.q1Max, unit: benchmark.unit, reason,
    };
    diagnostics.push(`Kostnad: ${reason}`);
    return;
  }

  const vintage = costVintageCompatibility(cost.costBaseYear, benchmark.dataPeriod);
  assessment.support.costBenchmarkYear = vintage.benchmarkYear;
  if (!vintage.compatible) {
    assessment.gates.cost = {
      status: 'NOT_VERIFIED', tier: null, value: cost.value,
      threshold: benchmark.q1Max, unit: benchmark.unit,
      reason: `${cost.reason} ${vintage.reason}`,
    };
    diagnostics.push(`Kostnad: ${vintage.reason}`);
    return;
  }

  const values: Partial<Record<Tier1CostMetric, number>> = { [cost.metric]: cost.value };
  const gate = assessCost({
    primaryMetal,
    primaryMetalRevenueShare: assessment.primaryMetalRevenueShare,
    costMetricValues: values,
    nowUtc: new Date().toISOString(),
  });
  gate.reason = `${gate.reason} Canonical cost bridge verifierad; basis ${cost.basisId}; ${vintage.reason}`;
  assessment.gates.cost = gate;
}

export default async function handler(req: any, res: any): Promise<void> {
  let capturedStatus = 200;
  let capturedBody: any = null;
  const captureRes: any = {
    status(code: number) {
      capturedStatus = code;
      return captureRes;
    },
    json(body: unknown) {
      capturedBody = body;
      return captureRes;
    },
  };

  await preRevenueHandler(req, captureRes);

  const symbol = String(req.query?.symbol ?? '').trim().toUpperCase();
  const assessment = capturedBody?.assessment;
  if (capturedStatus === 200 && capturedBody?.ok === true && assessment && symbol) {
    try {
      const loaded = await loadProjectsForSymbol(symbol);
      if (loaded.length > 1) {
        const observations = await computeProjectIrrObservations(symbol);
        const selection = selectConservativeProjectIrr(observations);

        if (selection.irr !== null) {
          const gate = assessCapitalReturns(selection.irr);
          const details = selection.included
            .map((project) => `${project.projectId} ${(project.irr * 100).toFixed(1)} %`)
            .join(' · ');
          gate.reason = `${gate.reason} Flerprojektregel: lägsta verifierade projekt-IRR bland investeringsprojekt sätter gaten (${details}).`;
          assessment.gates.capitalReturns = gate;
          assessment.support.tierBaseIrr = selection.irr;
          assessment.support.tierBaseIrrMethod = 'MIN_VERIFIED_INVESTMENT_PROJECT_IRR';
          assessment.support.tierBaseIrrByProject = Object.fromEntries(selection.included.map((project) => [project.projectId, project.irr]));
          assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
          assessment.diagnostics.push(`Kapitalavkastning: flerprojektregel använder lägsta verifierade projekt-IRR bland investeringsprojekt: ${details}.`);
          if (selection.ignoredNoInvestmentProjectIds.length > 0) {
            assessment.diagnostics.push(`Kapitalavkastning: projekt utan negativt investeringskassaflöde exkluderas från IRR-gaten: ${selection.ignoredNoInvestmentProjectIds.join(', ')}.`);
          }
        } else {
          const gate = assessCapitalReturns(null);
          gate.reason = selection.unresolvedProjectIds.length > 0
            ? `Projekt-IRR vid gemensamt spot-deck kunde inte verifieras för investeringsprojekt: ${selection.unresolvedProjectIds.join(', ')}.`
            : 'Ingen verifierbar projekt-IRR finns för något projekt med negativt investeringskassaflöde.';
          assessment.gates.capitalReturns = gate;
          assessment.support.tierBaseIrr = null;
          assessment.support.tierBaseIrrMethod = 'MIN_VERIFIED_INVESTMENT_PROJECT_IRR';
          assessment.support.tierBaseIrrByProject = Object.fromEntries(selection.included.map((project) => [project.projectId, project.irr]));
          assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
          assessment.diagnostics.push(gate.reason);
        }
      }

      if (assessment.primaryMetal) {
        const canonicalCost = await computeCanonicalCompanyCost(symbol, assessment.primaryMetal as Tier1Metal);
        applyCanonicalCostGate(assessment, canonicalCost);
      }

      const cyclePriceDisplay = await buildTierCyclePriceDisplay(
        symbol,
        assessment.support?.cycleMultipliersByMetal ?? {},
      );
      assessment.support.cyclePrices = cyclePriceDisplay.rows;
      assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
      assessment.diagnostics.push(...cyclePriceDisplay.diagnostics);

      const classification = classifyTier(assessment.gates);
      assessment.status = classification.status;
      assessment.classificationReason = classification.reason;
    } catch (error) {
      assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
      assessment.diagnostics.push(`Tier post-processing kunde inte verifieras: ${error instanceof Error ? error.message : String(error)}`);
      if (assessment.gates?.cost) {
        assessment.gates.cost = {
          status: 'NOT_VERIFIED', tier: null, value: null,
          threshold: assessment.gates.cost.threshold ?? null,
          unit: assessment.gates.cost.unit ?? null,
          reason: `Canonical cost post-processing misslyckades: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      const classification = classifyTier(assessment.gates);
      assessment.status = classification.status;
      assessment.classificationReason = classification.reason;
    }
  }

  res.status(capturedStatus).json(capturedBody);
}
