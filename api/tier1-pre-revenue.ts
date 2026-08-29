import preRevenueHandler from '../src/server/routes/tier1/pre-revenue.ts';
import { loadProjectsForSymbol } from '../src/lib/api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../src/lib/project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../src/lib/project/jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../src/lib/project/engineFullProductionV1.ts';
import { computeIrr } from '../src/lib/metrics/lista3.ts';
import {
  TIER1_COST_BENCHMARKS,
  type Tier1Metal,
} from '../src/lib/tier1/config.ts';
import { assessCapitalReturns, classifyTier } from '../src/lib/tier1/preRevenue.ts';
import { assessCostAgainstBenchmark } from '../src/lib/tier1/costBenchmarkAssessment.ts';
import { selectConservativeProjectIrr, type ProjectIrrObservation } from '../src/lib/tier1/projectIrr.ts';
import {
  extractReportedCostEvidence,
  reportedCostWeightInBenchmarkUnits,
} from '../src/lib/tier1/reportedCost.ts';
import { buildTierCyclePriceDisplay } from '../src/server/routes/tier1/cycle-price-display.ts';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

type ReportedCompanyCost = {
  value: number;
  unit: 'USD/lb' | 'USD/toz';
  projectDetails: string[];
};

/**
 * Reported cost is an optional best-available override. It is used only when
 * every project contributing payable primary-metal production has a usable
 * reported metric in the benchmark unit. Otherwise the Tier route keeps the
 * cost result already derived from the existing project engine in
 * src/server/routes/tier1/pre-revenue.ts. Missing evidence never turns an
 * otherwise computable model result into NOT_VERIFIED.
 */
async function computeReportedCompanyCost(
  symbol: string,
  primaryMetal: Tier1Metal,
): Promise<{ cost: ReportedCompanyCost | null; diagnostics: string[] }> {
  const loaded = await loadProjectsForSymbol(symbol);
  const benchmark = TIER1_COST_BENCHMARKS[primaryMetal];
  const diagnostics: string[] = [];
  let numerator = 0;
  let denominator = 0;
  const projectDetails: string[] = [];
  let contributingProjects = 0;

  for (const project of loaded) {
    const parsed = parseProjectJsonV1(project.rawJson);
    const payable = parsed.engineInputWithoutPrices.payableQtyByMetal[primaryMetal] ?? [];
    if (!payable.some((value) => finite(value) && value > 0)) continue;
    contributingProjects += 1;

    const reported = extractReportedCostEvidence(project.rawJson, benchmark.metric);
    if (reported.status !== 'AVAILABLE' || !finite(reported.value) || !reported.unit) {
      diagnostics.push(`${project.projectId}: ${reported.reason} Befintlig engine-baserad cost används i stället.`);
      return { cost: null, diagnostics };
    }
    if (reported.unit !== benchmark.unit) {
      diagnostics.push(`${project.projectId}: rapporterad ${reported.unit} kan inte jämföras direkt med ${benchmark.unit}; befintlig engine-baserad cost används.`);
      return { cost: null, diagnostics };
    }

    const payableUnit = parsed.engineInputWithoutPrices.payableQtyUnitByMetal[primaryMetal];
    const weight = reportedCostWeightInBenchmarkUnits({
      payableSeries: payable,
      payableUnit,
      benchmarkUnit: benchmark.unit,
    });
    if (!finite(weight) || weight <= 0) {
      diagnostics.push(`${project.projectId}: payable-vikt kan inte räknas i ${benchmark.unit}; befintlig engine-baserad cost används.`);
      return { cost: null, diagnostics };
    }

    numerator += reported.value * weight;
    denominator += weight;
    const provenance = [reported.sourceId, reported.pageOrTable].filter(Boolean).join(', ');
    projectDetails.push(`${project.projectId}: ${reported.value.toFixed(4)} ${reported.unit}${provenance ? ` · ${provenance}` : ''}`);
  }

  if (contributingProjects === 0 || !(denominator > 0)) return { cost: null, diagnostics };
  return {
    cost: { value: numerator / denominator, unit: benchmark.unit, projectDetails },
    diagnostics,
  };
}

function applyReportedCostOverride(assessment: any, reported: ReportedCompanyCost): void {
  const primaryMetal = assessment.primaryMetal as Tier1Metal | null;
  if (!primaryMetal) return;
  const benchmark = TIER1_COST_BENCHMARKS[primaryMetal];
  const diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics as string[] : [];
  assessment.diagnostics = diagnostics;

  assessment.support.costMetric = benchmark.metric;
  assessment.support.costMetricValue = reported.value;
  assessment.support.costMethod = 'REPORTED_COST_BEST_AVAILABLE';
  assessment.support.costProjectDetails = reported.projectDetails;
  assessment.support.costBenchmarkBasisId = benchmark.basisId;
  assessment.support.costBenchmarkDataPeriod = benchmark.dataPeriod;
  assessment.support.costBenchmarkSource = benchmark.sourceLabel;
  assessment.support.costBenchmarkPageOrTable = benchmark.sourcePageOrTable ?? null;

  const gate = assessCostAgainstBenchmark({
    primaryMetal,
    primaryMetalRevenueShare: assessment.primaryMetalRevenueShare,
    metric: benchmark.metric,
    value: reported.value,
    benchmark,
    nowUtc: new Date().toISOString(),
  });
  gate.reason = `${gate.reason} Projektkostnaden kommer från bästa tillgängliga rapporterade cost i project_json; benchmark-specifik basis/year är inte en hard guard.`;
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

      // Keep the existing multi-project Tier rule: the weakest verified project
      // investment IRR caps the company Tier. This is Tier-only behavior and does
      // not alter Project or Corporate engines.
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
            ? `Projekt-IRR vid gemensamt spot-deck kunde inte beräknas för investeringsprojekt: ${selection.unresolvedProjectIds.join(', ')}.`
            : 'Ingen beräkningsbar projekt-IRR finns för något projekt med negativt investeringskassaflöde.';
          assessment.gates.capitalReturns = gate;
          assessment.support.tierBaseIrr = null;
          assessment.support.tierBaseIrrMethod = 'MIN_VERIFIED_INVESTMENT_PROJECT_IRR';
          assessment.support.tierBaseIrrByProject = Object.fromEntries(selection.included.map((project) => [project.projectId, project.irr]));
          assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
          assessment.diagnostics.push(gate.reason);
        }
      }

      // Single source of truth: the base Tier route already derives cost from the
      // existing project engine. A reported JSON cost only overrides that result
      // when it is complete for all primary-metal projects; otherwise the base
      // engine result remains untouched.
      if (assessment.primaryMetal) {
        const reported = await computeReportedCompanyCost(symbol, assessment.primaryMetal as Tier1Metal);
        assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
        assessment.diagnostics.push(...reported.diagnostics.map((item) => `Kostnad: ${item}`));
        if (reported.cost) applyReportedCostOverride(assessment, reported.cost);
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
    } catch (error) {
      // Optional Tier post-processing must not invalidate a calculation that the
      // base Tier route already completed from project_json. Keep that result and
      // expose the post-processing problem as a diagnostic only.
      assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
      const message = error instanceof Error ? error.message : String(error);
      assessment.diagnostics.push(`Tier post-processing: ${message}. Basberäkningen behålls.`);
    }
  }

  res.status(capturedStatus).json(capturedBody);
}
