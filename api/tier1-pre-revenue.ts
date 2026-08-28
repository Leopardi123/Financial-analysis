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
import {
  extractReportedCostEvidence,
  reportedCostWeightInBenchmarkUnits,
} from '../src/lib/tier1/reportedCost.ts';
import { assessCompanyProjectReconciliation } from '../src/lib/tier1/reconciliation.ts';
import { buildTierCyclePriceDisplay } from '../src/server/routes/tier1/cycle-price-display.ts';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function canonicalCostBasisForMetal(metal: Tier1Metal): Tier1CostBasisId | null {
  if (metal === 'Cu') return 'S_AND_P_CO_PRODUCT_C1_CU';
  if (metal === 'Ni') return 'JAGUAR_NI_C1_MINE_SITE_GA';
  return null;
}

function sanitizeResolvedCuFallbackDiagnostics(assessment: any): void {
  const diagnostics = Array.isArray(assessment?.diagnostics) ? assessment.diagnostics as string[] : [];
  const hasSuccessfulDerivedCu = diagnostics.some((item) =>
    typeof item === 'string'
      && item.includes('price_diagnostic metal=Cu')
      && item.includes('derived=true'),
  );
  const hasNoPriceFailure = diagnostics.some((item) =>
    typeof item === 'string' && item.includes('metalsWithPriceFailure=[]'),
  );
  if (!hasSuccessfulDerivedCu || !hasNoPriceFailure) return;

  assessment.diagnostics = diagnostics.filter((item) => !(
    item.includes('Unknown commodity provider mapping for metal=Cu')
    || item.includes('Spot resolver failed for CU_USD_TONNE')
    || item.includes('Spot resolver failed for CU_USD_LB')
  ));
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

type ProjectCostObservation = {
  projectId: string;
  result: CanonicalCostResult;
  basisId: Tier1CostBasisId | null;
  method: 'REPORTED' | 'CANONICAL';
  sourceId: string | null;
  pageOrTable: string | null;
};

type CompanyCanonicalCost = CanonicalCostResult & {
  projectDetails: string[];
  basisId: Tier1CostBasisId | null;
  method: 'REPORTED_COST' | 'CANONICAL_COST_V1' | 'MIXED_REPORTED_CANONICAL' | 'NOT_VERIFIED';
};

async function computeCanonicalCompanyCost(symbol: string, primaryMetal: Tier1Metal): Promise<CompanyCanonicalCost> {
  const loaded = await loadProjectsForSymbol(symbol);
  const observations: ProjectCostObservation[] = [];
  const benchmark = TIER1_COST_BENCHMARKS[primaryMetal];
  const canonicalBasisId = canonicalCostBasisForMetal(primaryMetal);

  for (const project of loaded) {
    const parsed = parseProjectJsonV1(project.rawJson);
    const payable = parsed.engineInputWithoutPrices.payableQtyByMetal[primaryMetal] ?? [];
    if (!payable.some((value) => finite(value) && value > 0)) continue;

    const reported = extractReportedCostEvidence(project.rawJson, benchmark.metric);
    if (reported.status === 'INVALID') {
      observations.push({
        projectId: project.projectId,
        basisId: reported.basisId,
        method: 'REPORTED',
        sourceId: reported.sourceId,
        pageOrTable: reported.pageOrTable,
        result: {
          status: 'NOT_VERIFIED', metric: benchmark.metric, value: null, unit: benchmark.unit,
          numeratorUSD: null, denominator: null, costBaseYear: reported.costBaseYear,
          reason: reported.reason, diagnostics: [],
        },
      });
      continue;
    }

    if (reported.status === 'AVAILABLE') {
      if (reported.unit !== benchmark.unit) {
        observations.push({
          projectId: project.projectId,
          basisId: reported.basisId,
          method: 'REPORTED',
          sourceId: reported.sourceId,
          pageOrTable: reported.pageOrTable,
          result: {
            status: 'NOT_VERIFIED', metric: benchmark.metric, value: null, unit: benchmark.unit,
            numeratorUSD: null, denominator: null, costBaseYear: reported.costBaseYear,
            reason: `Rapporterad ${benchmark.metric} använder ${reported.unit}, men benchmarken kräver ${benchmark.unit}; ingen implicit enhets-/definitionskonvertering görs.`,
            diagnostics: [],
          },
        });
        continue;
      }
      const payableUnit = parsed.engineInputWithoutPrices.payableQtyUnitByMetal[primaryMetal];
      const denominator = reportedCostWeightInBenchmarkUnits({
        payableSeries: payable,
        payableUnit,
        benchmarkUnit: benchmark.unit,
      });
      if (!finite(denominator) || denominator <= 0 || !finite(reported.value)) {
        observations.push({
          projectId: project.projectId,
          basisId: reported.basisId,
          method: 'REPORTED',
          sourceId: reported.sourceId,
          pageOrTable: reported.pageOrTable,
          result: {
            status: 'NOT_VERIFIED', metric: benchmark.metric, value: null, unit: benchmark.unit,
            numeratorUSD: null, denominator: null, costBaseYear: reported.costBaseYear,
            reason: `${reported.reason} Payable-vikten kunde inte verifieras i benchmarkens enhet.`,
            diagnostics: [],
          },
        });
        continue;
      }
      observations.push({
        projectId: project.projectId,
        basisId: reported.basisId,
        method: 'REPORTED',
        sourceId: reported.sourceId,
        pageOrTable: reported.pageOrTable,
        result: {
          status: 'COMPUTABLE', metric: benchmark.metric, value: reported.value, unit: benchmark.unit,
          numeratorUSD: reported.value * denominator, denominator, costBaseYear: reported.costBaseYear,
          reason: reported.reason, diagnostics: [],
        },
      });
      continue;
    }

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
    observations.push({
      projectId: project.projectId,
      result,
      basisId: canonicalBasisId,
      method: 'CANONICAL',
      sourceId: null,
      pageOrTable: null,
    });
  }

  if (observations.length === 0) {
    return {
      status: 'NOT_VERIFIED', metric: null, value: null, unit: null, numeratorUSD: null, denominator: null,
      costBaseYear: null, reason: `Inget projekt med payable ${primaryMetal} hittades för cost-bedömningen.`, diagnostics: [],
      projectDetails: [], basisId: canonicalBasisId, method: 'NOT_VERIFIED',
    };
  }

  const unresolved = observations.filter(({ result }) => result.status !== 'COMPUTABLE');
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
      projectDetails: observations.map(({ projectId, result, method, sourceId, pageOrTable }) =>
        `${projectId}: ${result.status} · ${method}${sourceId ? ` · ${sourceId}${pageOrTable ? `, ${pageOrTable}` : ''}` : ''}`,
      ),
      basisId: unresolved[0].basisId,
      method: 'NOT_VERIFIED',
    };
  }

  const computed = observations.map((observation) => ({
    ...observation,
    result: observation.result as CanonicalCostResult & {
      status: 'COMPUTABLE'; value: number; numeratorUSD: number; denominator: number;
    },
  }));
  const metrics = new Set(computed.map(({ result }) => result.metric));
  const years = new Set(computed.map(({ result }) => result.costBaseYear));
  const basisIds = new Set(computed.map(({ basisId }) => basisId));
  if (metrics.size !== 1 || years.size !== 1 || basisIds.size !== 1 || basisIds.has(null)) {
    return {
      status: 'NOT_VERIFIED', metric: computed[0].result.metric, value: null, unit: computed[0].result.unit,
      numeratorUSD: null, denominator: null, costBaseYear: null,
      reason: 'Flerprojektsbolaget har inkompatibla cost metrics, definitionsbaser eller kostnadsbasår; ingen implicit sammanvägning görs.',
      diagnostics: [],
      projectDetails: computed.map(({ projectId, result, basisId, method }) =>
        `${projectId}: ${method} · ${result.metric} · basis ${basisId ?? 'saknas'} · basår ${String(result.costBaseYear)}`,
      ),
      basisId: null,
      method: 'NOT_VERIFIED',
    };
  }

  const numeratorUSD = computed.reduce((sum, { result }) => sum + result.numeratorUSD, 0);
  const denominator = computed.reduce((sum, { result }) => sum + result.denominator, 0);
  const methods = new Set(computed.map(({ method }) => method));
  const method: CompanyCanonicalCost['method'] = methods.size > 1
    ? 'MIXED_REPORTED_CANONICAL'
    : methods.has('REPORTED') ? 'REPORTED_COST' : 'CANONICAL_COST_V1';
  const basisId = computed[0].basisId;
  const value = denominator > 0 ? numeratorUSD / denominator : null;
  return {
    status: value !== null ? 'COMPUTABLE' : 'NOT_VERIFIED',
    metric: computed[0].result.metric,
    value,
    unit: computed[0].result.unit,
    numeratorUSD,
    denominator,
    costBaseYear: computed[0].result.costBaseYear,
    reason: method === 'REPORTED_COST'
      ? 'Rapporterad, definitionslåst kostnadsmetrik används direkt; flerprojekt viktas med payable mängd i benchmarkens enhet.'
      : method === 'MIXED_REPORTED_CANONICAL'
        ? 'Rapporterade och canonical-rekonstruerade kostnadsmetrik kombineras endast eftersom metric, basis och kostnadsår matchar exakt.'
        : computed[0].result.reason,
    diagnostics: computed.flatMap(({ projectId, result }) => result.diagnostics.map((item) => `${projectId}: ${item}`)),
    projectDetails: computed.map(({ projectId, result, method: projectMethod, sourceId, pageOrTable }) =>
      `${projectId}: ${result.value.toFixed(4)} ${result.unit ?? ''} · ${projectMethod}${sourceId ? ` · ${sourceId}${pageOrTable ? `, ${pageOrTable}` : ''}` : ''}`,
    ),
    basisId,
    method,
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
  assessment.support.costMethod = cost.method;
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
    const reason = `Cost-basis ${cost.basisId ?? 'saknas'} matchar inte benchmarkens ${benchmark.basisId}. Ingen implicit definitionskonvertering görs.`;
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
  gate.reason = `${gate.reason} ${cost.method === 'REPORTED_COST' ? 'Rapporterad kostnadsmetrik verifierad' : 'Canonical cost bridge verifierad'}; basis ${cost.basisId}; ${vintage.reason}`;
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
      const reconciliation = assessCompanyProjectReconciliation(
        loaded.map((project) => ({ projectId: project.projectId, rawJson: project.rawJson })),
      );
      assessment.support.reconciliationVerified = reconciliation.allVerified;
      assessment.support.projectReconciliation = reconciliation.projects;

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
      sanitizeResolvedCuFallbackDiagnostics(assessment);

      const classification = classifyTier(assessment.gates);
      assessment.status = classification.status;
      assessment.classificationReason = classification.reason;
      assessment.support.preReconciliationTierStatus = classification.status;

      if (!reconciliation.allVerified) {
        assessment.diagnostics.push(`Rapportavstämning: ${reconciliation.reason}`);
        for (const project of reconciliation.projects.filter((item) => item.status !== 'VERIFIED')) {
          assessment.diagnostics.push(`Rapportavstämning ${project.projectId}: ${project.reason}`);
        }

        if (classification.status === 'TIER_1') {
          assessment.status = 'NOT_VERIFIED';
          assessment.classificationReason = `Tier 1-kandidat, men slutlig Tier 1 kräver verifierad PEA/PFS/FS-avstämning: ${reconciliation.reason}`;
        } else if (classification.status === 'TIER_2' || classification.status === 'TIER_3' || classification.status === 'NOT_QUALIFIED') {
          assessment.classificationReason = `${classification.reason} Rapportavstämningen är ännu Ej verifierad; klassningen är därför provisorisk.`;
        }
      }
    } catch (error) {
      assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
      const message = error instanceof Error ? error.message : String(error);
      assessment.diagnostics.push(`Tier post-processing kunde inte verifieras: ${message}`);
      if (assessment.gates?.cost) {
        assessment.gates.cost = {
          status: 'NOT_VERIFIED', tier: null, value: null,
          threshold: assessment.gates.cost.threshold ?? null,
          unit: assessment.gates.cost.unit ?? null,
          reason: `Canonical cost post-processing misslyckades: ${message}`,
        };
      }
      assessment.status = 'NOT_VERIFIED';
      assessment.classificationReason = `Tier post-processing kunde inte verifieras: ${message}`;
    }
  }

  res.status(capturedStatus).json(capturedBody);
}
