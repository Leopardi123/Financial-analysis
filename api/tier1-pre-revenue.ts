import preRevenueHandler from '../src/server/routes/tier1/pre-revenue.ts';
import { loadProjectsForSymbol } from '../src/lib/api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../src/lib/project/jsonv1/parse.ts';
import { isProjectJsonV3 } from '../src/lib/project/jsonv3/compile.ts';
import { resolveProjectPricesToEngineInput } from '../src/lib/project/jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../src/lib/project/engineFullProductionV1.ts';
import { computeIrr } from '../src/lib/metrics/lista3.ts';
import { TIER1_COST_BENCHMARKS, type Tier1Metal } from '../src/lib/tier1/config.ts';
import { assessCapitalReturns, assessCost, classifyTier } from '../src/lib/tier1/preRevenue.ts';
import { computeTier1CyclePolicyForSymbol, TIER1_CYCLE_POLICY } from '../src/lib/tier1/cyclePolicyRuntime.ts';
import { selectConservativeProjectIrr, type ProjectIrrObservation } from '../src/lib/tier1/projectIrr.ts';
import { extractReportedCostEvidenceCandidates } from '../src/lib/tier1/reportedCost.ts';
import { runTier1CostNormalizationRecipes } from '../src/lib/tier1/costNormalizationRecipe.ts';
import { reconstructSourceLockedCuCoProductC1 } from '../src/lib/tier1/costCoProductReconstruction.ts';
import {
  assessCostPositionAgainstReference,
  assessSAndPCuRawReferenceCompatibility,
  buildSAndPCu2024CostPositionReference,
  technicalReportCostEvidenceClass,
} from '../src/lib/tier1/costPosition.ts';
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

type CostEvidenceDetail = {
  projectId: string;
  metric: string;
  value: number | null;
  unit: string | null;
  period: unknown;
  sourceId: string | null;
  pageOrTable: string | null;
  role: 'REPORT_CHECKPOINT_ONLY';
  reason: string;
};

function readV3ReportedCostCheckpoints(rawJson: Record<string, unknown>, expectedMetric: string, projectId: string): CostEvidenceDetail[] {
  if (rawJson.version !== 'project_json_v3') return [];
  const verification = typeof rawJson.verification === 'object' && rawJson.verification !== null && !Array.isArray(rawJson.verification)
    ? rawJson.verification as Record<string, unknown>
    : {};
  const checkpoints = verification.reportedCostCheckpoints;
  if (!Array.isArray(checkpoints)) return [];
  return checkpoints.flatMap((raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    if (row.metric !== expectedMetric) return [];
    return [{
      projectId,
      metric: expectedMetric,
      value: finite(row.value) ? row.value : null,
      unit: typeof row.unit === 'string' ? row.unit : null,
      period: row.period ?? null,
      sourceId: typeof row.sourceId === 'string' ? row.sourceId : null,
      pageOrTable: typeof row.pageOrTable === 'string' ? row.pageOrTable : null,
      role: 'REPORT_CHECKPOINT_ONLY' as const,
      reason: 'project_json_v3 report checkpoint: evidence/oracle only; it never overrides the canonical Project-engine cost calculation.',
    }];
  });
}

async function collectReportedCostEvidence(symbol: string, primaryMetal: Tier1Metal): Promise<CostEvidenceDetail[]> {
  const loaded = await loadProjectsForSymbol(symbol);
  const expectedMetric = TIER1_COST_BENCHMARKS[primaryMetal].metric;
  const details: CostEvidenceDetail[] = [];

  for (const project of loaded) {
    if (project.rawJson.version === 'project_json_v3') {
      details.push(...readV3ReportedCostCheckpoints(project.rawJson, expectedMetric, project.projectId));
      continue;
    }
    const candidates = extractReportedCostEvidenceCandidates(project.rawJson, expectedMetric);
    for (const candidate of candidates) {
      details.push({
        projectId: project.projectId,
        metric: candidate.metric,
        value: candidate.value,
        unit: candidate.unit,
        period: candidate.period,
        sourceId: candidate.sourceId,
        pageOrTable: candidate.pageOrTable,
        role: 'REPORT_CHECKPOINT_ONLY',
        reason: `${candidate.reason} Evidence only: reported cost cannot override the canonical Project-engine cost gate.`,
      });
    }
  }
  return details;
}

async function applySourceLockedCostRecipes(args: {
  loaded: Awaited<ReturnType<typeof loadProjectsForSymbol>>;
  assessment: any;
}): Promise<void> {
  const { loaded, assessment } = args;
  const batches: Array<{
    projectId: string;
    raw: any;
    result: Awaited<ReturnType<typeof runTier1CostNormalizationRecipes>>;
  }> = [];

  for (const project of loaded) {
    if (!isProjectJsonV3(project.rawJson)) continue;
    const result = await runTier1CostNormalizationRecipes(project.rawJson);
    batches.push({ projectId: project.projectId, raw: project.rawJson, result });
  }

  if (batches.length === 0) return;
  assessment.support = assessment.support ?? {};
  assessment.support.costNormalizationRecipes = batches.map(({ projectId, result }) => ({ projectId, result }));
  assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];

  for (const batch of batches) {
    assessment.diagnostics.push(`Kostnadsnormalisering ${batch.projectId}: ${batch.result.reason}`);
    for (const run of batch.result.runs) {
      if (run.normalized.status !== 'NORMALIZED') {
        assessment.diagnostics.push(`Kostnadsnormalisering ${batch.projectId}/${run.recipeId}: ${run.normalized.reason}`);
      } else if (run.benchmarkReadiness?.status === 'NOT_VERIFIED') {
        assessment.diagnostics.push(`Kostnadsbenchmark ${batch.projectId}/${run.recipeId}: Ej verifierad · ${run.benchmarkReadiness.blockers.join(', ')}.`);
      }
    }
  }

  if (assessment.primaryMetal === 'Cu') {
    const reference = buildSAndPCu2024CostPositionReference();
    if (reference) {
      const costPositionEvidence: any[] = [];
      for (const batch of batches) {
        for (const run of batch.result.runs) {
          if (run.normalized.status !== 'NORMALIZED') continue;
          const sourceId = batch.result.reportSourceId;
          const coProduct = await reconstructSourceLockedCuCoProductC1({
            raw: batch.raw,
            recipeId: run.recipeId,
            normalized: run.normalized,
          });

          let measuredMetric = run.normalized.metric;
          let measuredValue = run.normalized.value;
          let measuredUnit = run.normalized.unit;
          let measuredCostBaseYear = run.normalized.costBaseYear;
          let semanticCompatibility = assessSAndPCuRawReferenceCompatibility(run.normalized);
          let measurementRole: 'REPORT_DEFINED' | 'RECONSTRUCTED_CO_PRODUCT' = 'REPORT_DEFINED';
          let reasonPrefix = '';

          if (coProduct.status === 'RECONSTRUCTED') {
            measuredMetric = coProduct.metric;
            measuredValue = coProduct.value;
            measuredUnit = coProduct.unit;
            measuredCostBaseYear = coProduct.costBaseYear;
            measurementRole = 'RECONSTRUCTED_CO_PRODUCT';
            semanticCompatibility = { status: 'COMPATIBLE_FOR_RAW_REFERENCE', blockers: [] };
            reasonPrefix = `${coProduct.reason} Kvarvarande metodbegränsningar: ${coProduct.limitations.join('; ')}. `;
            assessment.diagnostics.push(
              `Co-product reconstruction ${batch.projectId}/${run.recipeId}: ${coProduct.value.toFixed(4)} USD/lb payable Cu · ${coProduct.allocationRevenueBasis} · source=${run.normalized.value.toFixed(4)} ${run.normalized.metric}.`,
            );
          }

          const position = assessCostPositionAgainstReference({
            measuredMetric,
            value: measuredValue,
            unit: measuredUnit,
            costBaseYear: measuredCostBaseYear,
            costEvidenceClass: technicalReportCostEvidenceClass(sourceId),
            semanticCompatibility,
            reference,
          });
          costPositionEvidence.push({
            projectId: batch.projectId,
            recipeId: run.recipeId,
            reportSourceId: sourceId,
            benchmarkReadiness: run.benchmarkReadiness,
            measurementRole,
            sourceMeasurement: {
              metric: run.normalized.metric,
              value: run.normalized.value,
              unit: run.normalized.unit,
              basis: run.normalized.basis,
            },
            coProductReconstruction: coProduct,
            reference: {
              id: reference.id,
              metric: reference.metric,
              dataYear: reference.dataYear,
              q1Max: reference.q1Max,
              p50Max: reference.p50Max,
              p75Max: reference.p75Max,
              unit: reference.unit,
              denominatorLabel: reference.denominatorLabel,
              sourceRole: reference.sourceRole,
              activationAllowed: reference.activationAllowed,
            },
            ...position,
            reason: `${reasonPrefix}${position.reason}`,
          });
        }
      }
      assessment.support.costPositionReference = reference;
      assessment.support.costPositionEvidence = costPositionEvidence;

      const reconstructed = costPositionEvidence.filter((row) => row.measurementRole === 'RECONSTRUCTED_CO_PRODUCT');
      if (assessment.gates.cost?.status === 'NOT_VERIFIED' && reconstructed.length === 1) {
        const row = reconstructed[0];
        const source = row.sourceMeasurement;
        const reconstruction = row.coProductReconstruction;
        assessment.gates.cost.reason = `Rapportdefinierad ${source.metric} har rekonstruerats till ${row.measuredCost.toFixed(3)} USD/lb payable Cu på co-product-basis (${reconstruction.allocationRevenueBasis}). Rå S&P-position: ${row.rawReferencePosition}. Hard Cost Tier förblir Ej verifierad eftersom den exakta S&P 2024-allokeringsvektorn/component boundary/vintage-metoden${reconstruction.reportSourceId === 'warintza-pfs-2025' ? ' och streambehandlingen' : ''} inte är verifierade.`;
      }

      for (const row of costPositionEvidence) {
        assessment.diagnostics.push(
          `Cost position ${row.projectId}/${row.recipeId}: role=${row.measurementRole} · ${row.comparability} · ${row.rawReferencePosition} · semanticBlockers=[${row.semanticBlockers.join(', ')}] · ${row.reason} Påverkar inte Tier-gaten.`,
        );
      }
    }
  }

  if (assessment.primaryMetal !== 'Cu') return;
  const eligible = batches.flatMap((batch) => batch.result.runs.flatMap((run) => (
    run.normalized.status === 'NORMALIZED'
      && run.normalized.metric === TIER1_COST_BENCHMARKS.Cu.metric
      && run.benchmarkReadiness?.status === 'VERIFIED'
      ? [{ projectId: batch.projectId, recipeId: run.recipeId, normalized: run.normalized }]
      : []
  )));

  if (eligible.length > 1) {
    assessment.diagnostics.push(`Kostnad Cu: ${eligible.length} benchmark-kompatibla source-locked recipes hittades. Ingen väljs implicit; Cost Tier förblir oförändrad.`);
    return;
  }
  if (eligible.length !== 1) return;

  const candidate = eligible[0];
  const costGate = assessCost({
    primaryMetal: 'Cu',
    primaryMetalRevenueShare: finite(assessment.primaryMetalRevenueShare) ? assessment.primaryMetalRevenueShare : null,
    costMetricValues: { C1_CU_USD_PER_LB: candidate.normalized.value },
    nowUtc: new Date().toISOString(),
  });
  assessment.gates.cost = costGate;
  assessment.support.costMetric = 'C1_CU_USD_PER_LB';
  assessment.support.costMetricValue = candidate.normalized.value;
  assessment.support.costMetricSource = {
    kind: 'SOURCE_LOCKED_NORMALIZATION_RECIPE',
    projectId: candidate.projectId,
    recipeId: candidate.recipeId,
  };
  assessment.diagnostics.push(`Kostnad Cu: source-locked recipe ${candidate.projectId}/${candidate.recipeId} passerade benchmark-readiness och matades till canonical Cost Tier-gate.`);
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

      const cyclePolicy = await computeTier1CyclePolicyForSymbol(symbol);
      assessment.gates.cycle = cyclePolicy.gate;
      assessment.support = assessment.support ?? {};
      assessment.support.cycleNpv10Usd = cyclePolicy.stressNpv10Usd;
      assessment.support.cycleDurationProductionPeriods = TIER1_CYCLE_POLICY.classificationStressYears;
      assessment.support.cycleMultipliersByMetal = cyclePolicy.multipliersByMetal;
      assessment.support.cycleMethod = cyclePolicy.method;
      assessment.support.cycleBaseRevenueUsd = cyclePolicy.baseRevenueUsd;
      assessment.support.cycleStressRevenueUsd = cyclePolicy.stressRevenueUsd;
      assessment.support.cycleRevenueRetention = cyclePolicy.revenueRetention;
      assessment.support.cycleNpvRetention = cyclePolicy.npvRetention;
      assessment.support.cycleDownsideBeta = cyclePolicy.downsideBeta;
      assessment.support.cycleStressIrr = cyclePolicy.stressIrr;
      assessment.support.cycleSurvivalNpv10Usd = cyclePolicy.survivalNpv10Usd;
      assessment.support.cycleSurvivalProductionPeriods = TIER1_CYCLE_POLICY.survivalStressYears;
      assessment.support.cycleProjectCount = cyclePolicy.projectCount;
      assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
      assessment.diagnostics.push(...cyclePolicy.diagnostics);
      assessment.diagnostics.push(`Cykelresistens aktiv policy: ${cyclePolicy.method} Corporate projectCount=${cyclePolicy.projectCount}.`);

      if (assessment.primaryMetal) {
        const evidence = await collectReportedCostEvidence(symbol, assessment.primaryMetal as Tier1Metal);
        assessment.support = assessment.support ?? {};
        assessment.support.reportedCostEvidence = evidence;
        if (evidence.length > 0) {
          assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
          assessment.diagnostics.push('Kostnad: rapporterade C1/AISC-värden visas endast som checkpoints; Tier-cost kommer från canonical Project-ekonomi och får inte override:as av rapportmåttet.');
        }
      }

      await applySourceLockedCostRecipes({ loaded, assessment });

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
      assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
      const message = error instanceof Error ? error.message : String(error);
      assessment.diagnostics.push(`Tier post-processing: ${message}. Basberäkningen behålls.`);
    }
  }

  res.status(capturedStatus).json(capturedBody);
}
