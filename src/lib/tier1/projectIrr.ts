export type ProjectIrrObservation = {
  projectId: string;
  irr: number | null;
  hasNegativeCashFlow: boolean;
  hasPositiveCashFlow: boolean;
};

export type ConservativeProjectIrrSelection = {
  irr: number | null;
  included: Array<{ projectId: string; irr: number }>;
  unresolvedProjectIds: string[];
  ignoredNoInvestmentProjectIds: string[];
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Tier capital returns are a project-quality criterion, not a synthetic
 * corporate IRR. For a multi-project company, every project that actually has
 * a negative investment cash-flow must have a valid project IRR. The most
 * conservative (lowest) valid project IRR sets the gate. Projects with no
 * negative cash-flow do not define an investment IRR and are ignored rather
 * than treated as 0% or NOT_VERIFIED.
 */
export function selectConservativeProjectIrr(
  observations: ProjectIrrObservation[],
): ConservativeProjectIrrSelection {
  const investmentProjects = observations.filter((project) => project.hasNegativeCashFlow);
  const ignoredNoInvestmentProjectIds = observations
    .filter((project) => !project.hasNegativeCashFlow)
    .map((project) => project.projectId);

  const unresolvedProjectIds = investmentProjects
    .filter((project) => !project.hasPositiveCashFlow || !finite(project.irr))
    .map((project) => project.projectId);

  const included = investmentProjects
    .filter((project): project is ProjectIrrObservation & { irr: number } => project.hasPositiveCashFlow && finite(project.irr))
    .map((project) => ({ projectId: project.projectId, irr: project.irr }));

  const irr = investmentProjects.length > 0
    && unresolvedProjectIds.length === 0
    && included.length === investmentProjects.length
    ? Math.min(...included.map((project) => project.irr))
    : null;

  return { irr, included, unresolvedProjectIds, ignoredNoInvestmentProjectIds };
}
