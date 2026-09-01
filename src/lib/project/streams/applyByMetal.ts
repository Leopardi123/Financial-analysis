import { computeStreamsByMetal } from './compute.ts';
import type { StreamMVIConfig } from './types.ts';

export type StreamsApplyByMetalInput = {
  masterN: number;
  payableQtyByMetal: Record<string, (number | null)[]>;
  spotPriceUSDByMetal: Record<string, (number | null)[]>;
  streamsByMetal: Record<string, StreamMVIConfig>;
};

export type StreamsApplyByMetalOutput = {
  preStreamPayableQtyByMetal: Record<string, (number | null)[]>;
  effectivePayableQtyByMetal: Record<string, (number | null)[]>;
  deliveredQtyByMetal: Record<string, (number | null)[]>;
  streamPurchaseRevenueUSDByMetal: Record<string, (number | null)[]>;
  streamPurchaseRevenueUSD_total: (number | null)[];
  streamValueUSDByMetal: Record<string, (number | null)[]>;
  streamTakeUSD_byMetal: Record<string, (number | null)[]>;
  streamTakeUSD_total: (number | null)[];
};

function sumStreamSeries(
  streamedMetals: string[],
  byMetal: Record<string, (number | null)[]>,
  expectedLength: number,
): (number | null)[] {
  const total = new Array<number | null>(expectedLength).fill(0);
  for (let t = 0; t < expectedLength; t += 1) {
    let valueAtT = 0;
    let hasNull = false;
    for (const metal of streamedMetals) {
      const value = byMetal[metal]?.[t];
      if (value === null || value === undefined || !Number.isFinite(value)) {
        hasNull = true;
        break;
      }
      valueAtT += value;
    }
    total[t] = hasNull ? null : valueAtT;
  }
  return total;
}

export function applyStreamsByMetal(input: StreamsApplyByMetalInput): StreamsApplyByMetalOutput {
  const expectedLength = input.masterN + 1;
  const streamedMetals = Object.keys(input.streamsByMetal);
  const computeOut = computeStreamsByMetal({
    masterN: input.masterN,
    payableQtyByMetal: input.payableQtyByMetal,
    spotPriceUSDByMetal: input.spotPriceUSDByMetal,
    streamsByMetal: input.streamsByMetal,
  });

  const streamTakeUSD_total = sumStreamSeries(streamedMetals, computeOut.streamValueUSDByMetal, expectedLength);
  const streamPurchaseRevenueUSD_total = sumStreamSeries(streamedMetals, computeOut.streamPurchaseRevenueUSDByMetal, expectedLength);

  return {
    preStreamPayableQtyByMetal: computeOut.preStreamPayableQtyByMetal,
    effectivePayableQtyByMetal: computeOut.effectivePayableQtyByMetal,
    deliveredQtyByMetal: computeOut.deliveredQtyByMetal,
    streamPurchaseRevenueUSDByMetal: computeOut.streamPurchaseRevenueUSDByMetal,
    streamPurchaseRevenueUSD_total,
    streamValueUSDByMetal: computeOut.streamValueUSDByMetal,
    streamTakeUSD_byMetal: computeOut.streamValueUSDByMetal,
    streamTakeUSD_total,
  };
}
