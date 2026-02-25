import { computeProjectPhase1 } from './phase1.ts';
import { computeProjectPhase2 } from './phase2.ts';
import type { ProjectEngineInput, ProjectEngineOutput } from './types.ts';

export function computeProjectEngine(input: ProjectEngineInput): ProjectEngineOutput {
  const p1 = computeProjectPhase1(input.phase1);
  const p2 = computeProjectPhase2({
    masterN: input.phase1.masterN,
    productionStartPeriod: input.phase1.productionStartPeriod,
    discountRate: input.phase2.discountRate,
    fcffUSD: p1.fcffUSD,
  });

  return {
    phase1: p1,
    phase2: p2,
  };
}
