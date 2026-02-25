import { computeProjectAisc } from './aisc/engine.ts';
import { computeProjectPhase1 } from './phase1.ts';
import { computeProjectPhase2 } from './phase2.ts';
import { computeProjectRevenue } from './revenue/engine.ts';
import { applyStreamsByMetal } from './streams/applyByMetal.ts';
import { computeProjectTakeMVI } from './take/engine.ts';
import type {
  ProjectEngineFromProductionWithStreamsInput,
  ProjectEngineFromProductionWithStreamsOutput,
} from './types.ts';

export function computeProjectEngineFromProductionWithStreams(
  input: ProjectEngineFromProductionWithStreamsInput,
): ProjectEngineFromProductionWithStreamsOutput {
  if (input.streams.masterN !== input.revenue.masterN) {
    throw new Error('streams.masterN must match revenue.masterN');
  }

  if (input.streams.masterN !== input.take.masterN) {
    throw new Error('streams.masterN must match take.masterN');
  }

  if (input.streams.masterN !== input.phase1.masterN) {
    throw new Error('streams.masterN must match phase1.masterN');
  }

  if (input.aisc.auPriceUSDPerOz.length !== input.streams.masterN + 1) {
    throw new Error('aisc.auPriceUSDPerOz length must equal masterN+1');
  }

  const streamsOut = applyStreamsByMetal(input.streams);

  const revenueOut = computeProjectRevenue({
    masterN: input.streams.masterN,
    payableQtyByMetal: streamsOut.effectivePayableQtyByMetal,
    priceUSDByMetal: input.streams.spotPriceUSDByMetal,
  });

  const takeOut = computeProjectTakeMVI({
    masterN: input.streams.masterN,
    grossRevenueUSD: revenueOut.grossRevenueUSD,
    byMetalRevenueUSD: revenueOut.byMetalRevenueUSD,
    items: input.take.items,
  });

  const phase1Out = computeProjectPhase1({
    ...input.phase1,
    revenueUSD: takeOut.netRevenueAfterTakeUSD,
    royaltiesUSD: streamsOut.streamTakeUSD_total,
  });

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
    streams: streamsOut,
    revenue: revenueOut,
    take: takeOut,
    phase1: phase1Out,
    phase2: phase2Out,
    aisc: aiscOut,
  };
}
