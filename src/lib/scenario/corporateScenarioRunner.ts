import {
  computeCorporateFullPipelineFromProjectInputs,
  type CorporateFullPipelineFromProjectInputsInput,
  type CorporateFullPipelineFromProjectInputsOutput,
} from '../corporate/pipeline/fromProjectInputs.ts';
import type { PriceScenarioSet, ScenarioKey } from './types.ts';

export type CorporateScenarioRunnerInput = {
  base: CorporateFullPipelineFromProjectInputsInput;
  pricesByScenario: PriceScenarioSet;
  strictMetalCoverage?: boolean | null;
};

export type CorporateScenarioRunnerOutput = {
  SPOT: CorporateFullPipelineFromProjectInputsOutput;
  LOW: CorporateFullPipelineFromProjectInputsOutput;
  HIGH: CorporateFullPipelineFromProjectInputsOutput;
};

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function validateScenarioPrices(
  base: CorporateFullPipelineFromProjectInputsInput,
  scenarioKey: ScenarioKey,
  scenarioPricesByMetal: Record<string, (number | null)[]>,
): void {
  for (const project of base.projects.projects) {
    const payableMetals = Object.keys(project.input.payableQtyByMetal);

    for (const metal of payableMetals) {
      if (!(metal in scenarioPricesByMetal)) {
        throw new Error(
          `Scenario ${scenarioKey} missing price series for metal ${metal} in project ${project.id}`,
        );
      }

      const scenarioSeries = scenarioPricesByMetal[metal];
      const expectedLength = project.input.masterN + 1;

      if (scenarioSeries.length !== expectedLength) {
        throw new Error(
          `Scenario ${scenarioKey} metal ${metal} in project ${project.id} has price series length ${String(
            scenarioSeries.length,
          )}, expected ${String(expectedLength)}`,
        );
      }
    }
  }
}

function runScenario(
  input: CorporateScenarioRunnerInput,
  scenarioKey: ScenarioKey,
): CorporateFullPipelineFromProjectInputsOutput {
  const scenarioBase = deepClone(input.base);
  const scenarioPricesByMetal = input.pricesByScenario[scenarioKey];

  if (input.strictMetalCoverage ?? true) {
    validateScenarioPrices(input.base, scenarioKey, scenarioPricesByMetal);
  }

  scenarioBase.projects.projects.forEach((project) => {
    project.input.spotPriceUSDByMetal = scenarioPricesByMetal;
  });

  return computeCorporateFullPipelineFromProjectInputs(scenarioBase);
}

export function computeCorporateScenarioRunner(
  input: CorporateScenarioRunnerInput,
): CorporateScenarioRunnerOutput {
  return {
    SPOT: runScenario(input, 'SPOT'),
    LOW: runScenario(input, 'LOW'),
    HIGH: runScenario(input, 'HIGH'),
  };
}
