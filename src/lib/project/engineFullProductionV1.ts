import { computeProjectAisc } from './aisc/engine.ts';
import { computeNationalTake } from './nationalTake/engine.ts';
import { computeProjectPhase2 } from './phase2.ts';
import { computeProjectRevenue } from './revenue/engine.ts';
import { applyStreamsByMetal } from './streams/applyByMetal.ts';
import type {
  ProjectEngineFullProductionV1Input,
  ProjectEngineFullProductionV1Output,
} from './types.ts';

function zeroSeries(length: number): number[] {
  return new Array(length).fill(0);
}

export function computeProjectEngineFullProductionV1(
  input: ProjectEngineFullProductionV1Input,
): ProjectEngineFullProductionV1Output {
  if (input.phase1.masterN !== input.masterN) {
    throw new Error('phase1.masterN must match masterN');
  }

  if (input.aisc.auPriceUSDPerOz.length !== input.masterN + 1) {
    throw new Error('aisc.auPriceUSDPerOz length must equal masterN+1');
  }

  const hasStreams = Boolean(input.streamsByMetal && Object.keys(input.streamsByMetal).length > 0);

  const streamsOut = hasStreams
    ? applyStreamsByMetal({
        masterN: input.masterN,
        payableQtyByMetal: input.payableQtyByMetal,
        spotPriceUSDByMetal: input.spotPriceUSDByMetal,
        streamsByMetal: input.streamsByMetal ?? {},
      })
    : null;

  const revenueOut = computeProjectRevenue({
    masterN: input.masterN,
    payableQtyByMetal: input.payableQtyByMetal,
    priceUSDByMetal: input.spotPriceUSDByMetal,
    streamsByMetal: input.streamsByMetal,
  });

  const nationalTakeOut = computeNationalTake({
    masterN: input.masterN,
    grossRevenueUSD: revenueOut.grossRevenueUSD,
    byMetalRevenueUSD: revenueOut.byMetalRevenueUSD,
    spotPriceUSDByMetal: input.spotPriceUSDByMetal,
    priceSeriesByKey: input.priceSeriesByKey ?? null,
    priceKeyByMetal: input.priceKeyByMetal ?? null,
    auPriceKey: input.auPriceKey ?? null,
    items: input.takeItems,
    royaltiesDetail: input.royaltiesDetail,
    phase1: input.phase1,
    extraRoyaltiesUSD: zeroSeries(input.masterN + 1),
  });

  const phase2Out = computeProjectPhase2({
    masterN: input.masterN,
    productionStartPeriod: input.phase1.productionStartPeriod,
    discountRate: input.phase2.discountRate,
    fcffUSD: nationalTakeOut.phase1.fcffUSD,
  });

  const aiscOut = computeProjectAisc({
    masterN: input.masterN,
    productionStartPeriod: input.phase1.productionStartPeriod,
    grossRevenueUSD: revenueOut.grossRevenueUSD,
    auPriceUSDPerOz: input.aisc.auPriceUSDPerOz,
    sustainingCostUSD: nationalTakeOut.phase1.sustainingCostUSD,
  });

  return {
    streams: streamsOut,
    revenue: revenueOut,
    nationalTake: nationalTakeOut,
    totalTakeUSD: nationalTakeOut.totalTakeUSD,
    itemTakeUSDById: nationalTakeOut.itemTakeUSDById,
    phase1: nationalTakeOut.phase1,
    phase2: phase2Out,
    aisc: aiscOut,
    capexUSD_used: input.phase1.capexUSD,
  };
}
