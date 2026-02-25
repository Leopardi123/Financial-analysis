import { computeProjectPhase1 } from './phase1.ts';
import { computeProjectPhase2 } from './phase2.ts';
import { computeProjectTakeMVI } from './take/engine.ts';
import type { ProjectEngineWithTakeInput, ProjectEngineWithTakeOutput, ProjectPhase1Input } from './types.ts';

function assertEqualSeries(left: (number | null)[], right: (number | null)[], name: string): void {
  if (left.length !== right.length) {
    throw new Error(`${name} must match take.grossRevenueUSD length`);
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!Object.is(left[index], right[index])) {
      throw new Error(`${name} must match take.grossRevenueUSD values`);
    }
  }
}

export function computeProjectEngineWithTake(input: ProjectEngineWithTakeInput): ProjectEngineWithTakeOutput {
  if (input.take.masterN !== input.phase1.masterN) {
    throw new Error('take.masterN must match phase1.masterN');
  }

  assertEqualSeries(input.phase1.grossRevenueUSD, input.take.grossRevenueUSD, 'phase1.grossRevenueUSD');

  const take = computeProjectTakeMVI(input.take);
  const phase1 = computeProjectPhase1({
    ...input.phase1,
    revenueUSD: take.netRevenueAfterTakeUSD,
  } as ProjectPhase1Input);

  const phase2 = computeProjectPhase2({
    masterN: input.phase1.masterN,
    productionStartPeriod: input.phase1.productionStartPeriod,
    discountRate: input.phase2.discountRate,
    fcffUSD: phase1.fcffUSD,
  });

  return {
    take,
    phase1,
    phase2,
  };
}
