import { computeCorporateFromProjectEngines } from './fromProjectEngines.ts';
import type { CorporateProjectsOutput } from './types.ts';
import { computeProjectEngineFullProductionV1 } from '../../project/engineFullProductionV1.ts';
import { diagnoseProjectFullProductionV1, validateProjectFullProductionV1 } from '../../project/validation/fullProductionV1.ts';
import type {
  ProjectEngineFullProductionV1Input,
  ProjectEngineFullProductionV1Output,
} from '../../project/types.ts';
import type { ValidationReport } from '../../project/validation/types.ts';

export type CorporateFromProjectInputsInput = {
  discountRate: number;
  masterN: number;
  validate?: boolean | null;
  diagnose?: boolean | null;
  projects: Array<{
    id: string;
    input: ProjectEngineFullProductionV1Input;
  }>;
};

export type CorporateFromProjectInputsOutput = {
  projectOutputs: Array<{ id: string; out: ProjectEngineFullProductionV1Output }>;
  corporateProjects: CorporateProjectsOutput;
  diagnostics?: Array<{ id: string; report: ValidationReport }>;
};

function getPhase1ProductionStartPeriod(out: ProjectEngineFullProductionV1Output): number | null {
  const value = (out.phase1 as { productionStartPeriod?: unknown }).productionStartPeriod;
  return Number.isInteger(value) ? (value as number) : null;
}

function getRequiredProductionStartPeriod(map: Map<string, number>, projectId: string): number {
  const value = map.get(projectId);
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Project ${projectId} has non-integer productionStartPeriod`);
  }
  return value;
}

export function computeCorporateFromProjectInputs(
  input: CorporateFromProjectInputsInput,
): CorporateFromProjectInputsOutput {
  if (input.projects.length < 1) {
    throw new Error('At least one project is required');
  }

  const shouldValidate = input.validate === true;
  const shouldDiagnose = input.diagnose === true;
  const projectOutputs: Array<{ id: string; out: ProjectEngineFullProductionV1Output }> = [];
  const diagnostics: Array<{ id: string; report: ValidationReport }> = [];
  const productionStartPeriodById = new Map<string, number>();

  for (const project of input.projects) {
    if (project.input.masterN !== input.masterN) {
      throw new Error(`Project ${project.id} masterN mismatch: input=${project.input.masterN} corporate=${input.masterN}`);
    }

    if (shouldValidate) {
      validateProjectFullProductionV1(project.input);
    }

    if (shouldDiagnose) {
      diagnostics.push({
        id: project.id,
        report: diagnoseProjectFullProductionV1(project.input),
      });
    }

    projectOutputs.push({
      id: project.id,
      out: computeProjectEngineFullProductionV1(project.input),
    });
    productionStartPeriodById.set(project.id, project.input.phase1.productionStartPeriod);
  }

  const corporateProjects = computeCorporateFromProjectEngines({
    discountRate: input.discountRate,
    masterN: input.masterN,
    projects: projectOutputs.map((project) => ({
      id: project.id,
      productionStartPeriod: getPhase1ProductionStartPeriod(project.out) ?? getRequiredProductionStartPeriod(productionStartPeriodById, project.id),
      out: project.out,
    })),
  });

  if (shouldDiagnose) {
    return {
      projectOutputs,
      corporateProjects,
      diagnostics,
    };
  }

  return {
    projectOutputs,
    corporateProjects,
  };
}
