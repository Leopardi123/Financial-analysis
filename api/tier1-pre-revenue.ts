import preRevenueHandler from '../src/server/routes/tier1/pre-revenue.ts';
import { loadProjectsForSymbol } from '../src/lib/api/loadProjectsForSymbol.ts';
import { parseProjectJsonV1 } from '../src/lib/project/jsonv1/parse.ts';
import { resolveProjectPricesToEngineInput } from '../src/lib/project/jsonv1/resolvePrices.ts';
import { computeProjectEngineFullProductionV1 } from '../src/lib/project/engineFullProductionV1.ts';
import { computeIrr } from '../src/lib/metrics/lista3.ts';
import { assessCapitalReturns, classifyTier } from '../src/lib/tier1/preRevenue.ts';
import { selectConservativeProjectIrr, type ProjectIrrObservation } from '../src/lib/tier1/projectIrr.ts';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

        const classification = classifyTier(assessment.gates);
        assessment.status = classification.status;
        assessment.classificationReason = classification.reason;
      }
    } catch (error) {
      const gate = assessCapitalReturns(null);
      gate.reason = `Flerprojektens projekt-IRR kunde inte verifieras: ${error instanceof Error ? error.message : String(error)}`;
      assessment.gates.capitalReturns = gate;
      assessment.support.tierBaseIrr = null;
      assessment.support.tierBaseIrrMethod = 'MIN_VERIFIED_INVESTMENT_PROJECT_IRR';
      assessment.diagnostics = Array.isArray(assessment.diagnostics) ? assessment.diagnostics : [];
      assessment.diagnostics.push(gate.reason);
      const classification = classifyTier(assessment.gates);
      assessment.status = classification.status;
      assessment.classificationReason = classification.reason;
    }
  }

  res.status(capturedStatus).json(capturedBody);
}
