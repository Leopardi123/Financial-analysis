import { computeProjectAisc } from './aisc/engine.ts';
import { computeProjectEngine } from './engine.ts';
import type { ProjectEngineWithAiscInput, ProjectEngineWithAiscOutput } from './types.ts';

function assertSeriesLength(series: (number | null)[], masterN: number, name: string): void {
  if (series.length !== masterN + 1) {
    throw new Error(`${name} length must equal phase1.masterN+1`);
  }
}

export function computeProjectEngineWithAisc(input: ProjectEngineWithAiscInput): ProjectEngineWithAiscOutput {
  assertSeriesLength(input.aisc.grossRevenueUSD, input.engine.phase1.masterN, 'aisc.grossRevenueUSD');
  assertSeriesLength(input.aisc.auPriceUSDPerOz, input.engine.phase1.masterN, 'aisc.auPriceUSDPerOz');

  const out = computeProjectEngine(input.engine);

  const aiscOut = computeProjectAisc({
    masterN: input.engine.phase1.masterN,
    productionStartPeriod: input.engine.phase1.productionStartPeriod,
    grossRevenueUSD: input.aisc.grossRevenueUSD,
    auPriceUSDPerOz: input.aisc.auPriceUSDPerOz,
    sustainingCostUSD: out.phase1.sustainingCostUSD,
  });

  return { ...out, aisc: aiscOut };
}
