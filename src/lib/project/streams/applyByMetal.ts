import { applyStreamMVI } from './engine.ts';
import type { StreamMVIConfig } from './types.ts';

export type StreamsApplyByMetalInput = {
  masterN: number;
  payableQtyByMetal: Record<string, (number | null)[]>;
  spotPriceUSDByMetal: Record<string, (number | null)[]>;
  streamsByMetal: Record<string, StreamMVIConfig>;
};

export type StreamsApplyByMetalOutput = {
  effectivePayableQtyByMetal: Record<string, (number | null)[]>;
  deliveredQtyByMetal: Record<string, (number | null)[]>;
  streamTakeUSD_byMetal: Record<string, (number | null)[]>;
  streamTakeUSD_total: (number | null)[];
};

export function applyStreamsByMetal(input: StreamsApplyByMetalInput): StreamsApplyByMetalOutput {
  const expectedLength = input.masterN + 1;
  const payableMetals = Object.keys(input.payableQtyByMetal);

  if (payableMetals.length < 1) {
    throw new Error('payableQtyByMetal must include at least one metal');
  }

  for (const metal of payableMetals) {
    const payableSeries = input.payableQtyByMetal[metal];
    if (payableSeries.length !== expectedLength) {
      throw new Error(`payableQtyByMetal[${metal}] length must equal masterN+1`);
    }

    const spotSeries = input.spotPriceUSDByMetal[metal];
    if (!spotSeries) {
      throw new Error(`spotPriceUSDByMetal missing required metal ${metal}`);
    }
  }

  for (const [metal, spotSeries] of Object.entries(input.spotPriceUSDByMetal)) {
    if (spotSeries.length !== expectedLength) {
      throw new Error(`spotPriceUSDByMetal[${metal}] length must equal masterN+1`);
    }
  }

  const streamedMetals = Object.keys(input.streamsByMetal);
  for (const metal of streamedMetals) {
    if (!(metal in input.payableQtyByMetal)) {
      throw new Error(`streamsByMetal references unknown payable metal ${metal}`);
    }

    if (!(metal in input.spotPriceUSDByMetal)) {
      throw new Error(`streamsByMetal references unknown spot metal ${metal}`);
    }
  }

  const effectivePayableQtyByMetal: Record<string, (number | null)[]> = {};
  const deliveredQtyByMetal: Record<string, (number | null)[]> = {};
  const streamTakeUSD_byMetal: Record<string, (number | null)[]> = {};

  for (const metal of payableMetals) {
    if (metal in input.streamsByMetal) {
      const streamOutput = applyStreamMVI({
        masterN: input.masterN,
        payableQty: input.payableQtyByMetal[metal],
        spotPriceUSDPerUnit: input.spotPriceUSDByMetal[metal],
        config: input.streamsByMetal[metal],
      });

      effectivePayableQtyByMetal[metal] = streamOutput.effectivePayableQty;
      deliveredQtyByMetal[metal] = streamOutput.deliveredQty;
      streamTakeUSD_byMetal[metal] = streamOutput.streamTakeUSD;
      continue;
    }

    effectivePayableQtyByMetal[metal] = [...input.payableQtyByMetal[metal]];
  }

  const streamTakeUSD_total = new Array<number | null>(expectedLength).fill(0);
  if (streamedMetals.length > 0) {
    for (let t = 0; t <= input.masterN; t += 1) {
      let totalAtT = 0;
      let hasNull = false;

      for (const metal of streamedMetals) {
        const value = streamTakeUSD_byMetal[metal][t];
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
    effectivePayableQtyByMetal,
    deliveredQtyByMetal,
    streamTakeUSD_byMetal,
    streamTakeUSD_total,
  };
}
