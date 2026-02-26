import { computeStreamsByMetal } from './compute.js';
import type { StreamMVIConfig } from './types.js';

export type StreamsApplyByMetalInput = {
  masterN: number;
  payableQtyByMetal: Record<string, (number | null)[]>;
  spotPriceUSDByMetal: Record<string, (number | null)[]>;
  streamsByMetal: Record<string, StreamMVIConfig>;
};

export type StreamsApplyByMetalOutput = {
  effectivePayableQtyByMetal: Record<string, (number | null)[]>;
  deliveredQtyByMetal: Record<string, (number | null)[]>;
  streamValueUSDByMetal: Record<string, (number | null)[]>;
  streamTakeUSD_byMetal: Record<string, (number | null)[]>;
  streamTakeUSD_total: (number | null)[];
};

export function applyStreamsByMetal(input: StreamsApplyByMetalInput): StreamsApplyByMetalOutput {
  const expectedLength = input.masterN + 1;
  const streamedMetals = Object.keys(input.streamsByMetal);

  const computeOut = computeStreamsByMetal({
    masterN: input.masterN,
    payableQtyByMetal: input.payableQtyByMetal,
    spotPriceUSDByMetal: input.spotPriceUSDByMetal,
    streamsByMetal: input.streamsByMetal,
  });

  const streamTakeUSD_total = new Array<number | null>(expectedLength).fill(0);
  if (streamedMetals.length > 0) {
    for (let t = 0; t <= input.masterN; t += 1) {
      let totalAtT = 0;
      let hasNull = false;

      for (const metal of streamedMetals) {
        const value = computeOut.streamValueUSDByMetal[metal][t];
        if (value === null) {
          hasNull = true;
          break;
        }

        totalAtT += value;
      }

      streamTakeUSD_total[t] = hasNull ? null : totalAtT;
    }
  }

  return {
    effectivePayableQtyByMetal: computeOut.effectivePayableQtyByMetal,
    deliveredQtyByMetal: computeOut.deliveredQtyByMetal,
    streamValueUSDByMetal: computeOut.streamValueUSDByMetal,
    streamTakeUSD_byMetal: computeOut.streamValueUSDByMetal,
    streamTakeUSD_total,
  };
}
