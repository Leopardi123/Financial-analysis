import { computeProjectAisc } from './aisc/engine.js';
import { computeProjectPhase1 } from './phase1.js';
import { computeProjectPhase2 } from './phase2.js';
import { computeProjectRevenue } from './revenue/engine.js';
import { computeProjectTakeMVI } from './take/engine.js';
import type {
  ProjectEngineFromProductionInput,
  ProjectEngineFromProductionOutput,
  ProjectPhase1Input,
} from './types.js';

export function computeProjectEngineFromProduction(
  input: ProjectEngineFromProductionInput,
): ProjectEngineFromProductionOutput {
  if (input.revenue.masterN !== input.take.masterN) {
    throw new Error('revenue.masterN must match take.masterN');
  }

  if (input.revenue.masterN !== input.phase1.masterN) {
    throw new Error('revenue.masterN must match phase1.masterN');
  }

  if (input.aisc.auPriceUSDPerOz.length !== input.revenue.masterN + 1) {
    throw new Error('aisc.auPriceUSDPerOz length must equal masterN+1');
  }

  const revenueOut = computeProjectRevenue(input.revenue);

  const takeOut = computeProjectTakeMVI({
    masterN: input.revenue.masterN,
    grossRevenueUSD: revenueOut.grossRevenueUSD,
    byMetalRevenueUSD: revenueOut.byMetalRevenueUSD,
    items: input.take.items,
  });

  const phase1Out = computeProjectPhase1({
    ...input.phase1,
    revenueUSD: takeOut.netRevenueAfterTakeUSD,
  } as ProjectPhase1Input);

  const phase2Out = computeProjectPhase2({
    masterN: input.phase1.masterN,
    productionStartPeriod: input.phase1.productionStartPeriod,
    discountRate: input.phase2.discountRate,
    fcffUSD: phase1Out.fcffUSD,
  });

  const aiscOut = computeProjectAisc({
    masterN: input.phase1.masterN,
    productionStartPeriod: input.phase1.productionStartPeriod,
    grossRevenueUSD: revenueOut.grossRevenueUSD,
    auPriceUSDPerOz: input.aisc.auPriceUSDPerOz,
    sustainingCostUSD: phase1Out.sustainingCostUSD,
  });

  return {
    revenue: revenueOut,
    take: takeOut,
    phase1: phase1Out,
    phase2: phase2Out,
    aisc: aiscOut,
  };
}
