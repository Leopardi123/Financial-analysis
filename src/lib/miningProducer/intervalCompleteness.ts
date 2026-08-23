import { resolveOwnershipForYear } from './ownership.ts';
import { isProjectIncludedInCase } from './production.ts';
import type { ProducerCaseMode, ProducerJsonV1, ProducerProject, ProductionDisclosure } from './types.ts';

export type ProducerIntervalCompleteness = {
  productionComplete: boolean;
  revenueComplete: boolean;
  diagnostics: string[];
};

function projectActive(project: ProducerProject, year: number, caseMode: ProducerCaseMode): boolean {
  if (!isProjectIncludedInCase(project.statusAsOfValuationDate, caseMode)) return false;
  const window = project.productionWindow;
  if (!window) return true;
  return year >= window.startYear && (window.endYear === undefined || year <= window.endYear);
}

function exactYear(project: ProducerProject, year: number): ProductionDisclosure[] {
  return project.production.filter((item) => item.period.kind === 'year' && item.period.year === year);
}

function ownershipAvailable(project: ProducerProject, year: number): boolean {
  return resolveOwnershipForYear(project.ownership, year).status === 'exact';
}

function financialFactorAvailable(project: ProducerProject, year: number): boolean {
  const consolidation = project.financialConsolidation;
  if (!consolidation) return ownershipAvailable(project, year);
  if (consolidation.method === 'full' || consolidation.method === 'equity_method') return true;
  return Number.isFinite(consolidation.consolidationPct);
}

function disclosureBasisAvailable(
  project: ProducerProject,
  disclosure: ProductionDisclosure,
  year: number,
  basis: 'attributable' | 'financial',
): boolean {
  if (basis === 'attributable') {
    return disclosure.basis === 'attributable' || ownershipAvailable(project, year);
  }
  if (!financialFactorAvailable(project, year)) return false;
  if (disclosure.basis === 'project_100pct') return true;
  // Converting attributable source production to a different financial basis
  // requires the equity ownership denominator as well.
  return ownershipAvailable(project, year);
}

export function assessProducerIntervalCompleteness(args: {
  producer: ProducerJsonV1;
  year: number;
  caseMode: ProducerCaseMode;
  basis: 'attributable' | 'financial';
}): ProducerIntervalCompleteness {
  const diagnostics: string[] = [];
  let productionComplete = true;
  let revenueComplete = true;

  for (const project of args.producer.projects.filter((item) => projectActive(item, args.year, args.caseMode))) {
    const rows = exactYear(project, args.year);
    const produced = rows.filter((item) => item.measure === 'produced');
    if (produced.length === 0) {
      productionComplete = false;
      revenueComplete = false;
      diagnostics.push(`${project.id}: no exact-year produced disclosure for ${args.year}; partial company interval is forbidden. Add productionWindow if the project is explicitly pre-production/non-producing in this year.`);
      continue;
    }

    for (const disclosure of produced) {
      if (!disclosureBasisAvailable(project, disclosure, args.year, args.basis)) {
        productionComplete = false;
        diagnostics.push(`${project.id}/${disclosure.id}: ${args.basis} production basis cannot be resolved for ${args.year}.`);
      }
    }

    const metals = [...new Set(rows.map((item) => item.metal))];
    for (const metal of metals) {
      let selected: ProductionDisclosure | null = null;
      for (const measure of ['payable', 'sold', 'produced'] as const) {
        const candidates = rows.filter((item) => item.metal === metal && item.measure === measure);
        if (candidates.length > 1) {
          revenueComplete = false;
          diagnostics.push(`${project.id}/${metal}: multiple ${measure} disclosures for ${args.year}; revenue precedence unresolved.`);
          selected = null;
          break;
        }
        if (candidates.length === 1) {
          selected = candidates[0];
          break;
        }
      }
      if (!selected) {
        revenueComplete = false;
        diagnostics.push(`${project.id}/${metal}: no payable/sold/produced revenue quantity for ${args.year}.`);
        continue;
      }
      if (!disclosureBasisAvailable(project, selected, args.year, args.basis)) {
        revenueComplete = false;
        diagnostics.push(`${project.id}/${selected.id}: ${args.basis} revenue quantity basis cannot be resolved for ${args.year}.`);
      }
    }
  }

  return {
    productionComplete,
    revenueComplete,
    diagnostics: [...new Set(diagnostics)],
  };
}
