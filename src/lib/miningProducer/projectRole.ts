import { isProjectIncludedInCase } from './production.ts';
import type { ProducerCaseMode, ProducerProject } from './types.ts';

export type ProducerProjectCalculationRole = 'economic_project' | 'evidence_only_unallocated';

type ProjectWithCalculationRole = ProducerProject & {
  calculationRole?: ProducerProjectCalculationRole;
};

export function getProducerProjectCalculationRole(project: ProducerProject): ProducerProjectCalculationRole {
  return (project as ProjectWithCalculationRole).calculationRole ?? 'economic_project';
}

export function isProducerEconomicProject(project: ProducerProject): boolean {
  return getProducerProjectCalculationRole(project) === 'economic_project';
}

export function isUnallocatedProducerEvidenceGroup(project: ProducerProject): boolean {
  return getProducerProjectCalculationRole(project) === 'evidence_only_unallocated';
}

export function projectRoleIncludedInCase(project: ProducerProject, caseMode: ProducerCaseMode): boolean {
  return isProjectIncludedInCase(project.statusAsOfValuationDate, caseMode);
}

export function projectHasExactYearProduction(project: ProducerProject, year: number): boolean {
  return project.production.some((item) => item.period.kind === 'year' && item.period.year === year);
}

/**
 * An unallocated reporting group means the source published real production for
 * an aggregation that cannot safely be decomposed into the economic projects
 * used by the canonical model (for example a mine + regional feed with different
 * ownership percentages). The group is display evidence only: its ounces are not
 * added to canonical totals, but an exact-year disclosure deliberately blocks a
 * false partial company total for that year.
 */
export function unresolvedUnallocatedEvidenceGroups(
  projects: readonly ProducerProject[],
  year: number,
  caseMode: ProducerCaseMode,
): ProducerProject[] {
  return projects.filter((project) =>
    isUnallocatedProducerEvidenceGroup(project)
    && projectRoleIncludedInCase(project, caseMode)
    && projectHasExactYearProduction(project, year),
  );
}
