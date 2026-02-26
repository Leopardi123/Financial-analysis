import type { StreamMVIConfig } from './types.js';
import { applyStreamMVI } from './engine.js';

export type StreamComputeInputs = {
  masterN: number;
  payableQtyByMetal: Record<string, Array<number | null>>;
  spotPriceUSDByMetal: Record<string, Array<number | null>>;
  streamsByMetal: Record<string, StreamMVIConfig> | null;
};

export type StreamComputeOutputs = {
  effectivePayableQtyByMetal: Record<string, Array<number | null>>;
  deliveredQtyByMetal: Record<string, Array<number | null>>;
  streamValueUSDByMetal: Record<string, Array<number | null>>;
};

function normalizeStreamsByMetal(streamsByMetal: Record<string, StreamMVIConfig> | null): Record<string, StreamMVIConfig> {
  return streamsByMetal ?? {};
}

export function computeStreamsByMetal(input: StreamComputeInputs): StreamComputeOutputs {
  const expectedLength = input.masterN + 1;
  const payableMetals = Object.keys(input.payableQtyByMetal);
  const streamsByMetal = normalizeStreamsByMetal(input.streamsByMetal);

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

    if (spotSeries.length !== expectedLength) {
      throw new Error(`spotPriceUSDByMetal[${metal}] length must equal masterN+1`);
    }
  }

  for (const metal of Object.keys(streamsByMetal)) {
    if (!(metal in input.payableQtyByMetal)) {
      throw new Error(`streamsByMetal references unknown payable metal ${metal}`);
    }

    if (!(metal in input.spotPriceUSDByMetal)) {
      throw new Error(`streamsByMetal references unknown spot metal ${metal}`);
    }
  }

  const effectivePayableQtyByMetal: Record<string, Array<number | null>> = {};
  const deliveredQtyByMetal: Record<string, Array<number | null>> = {};
  const streamValueUSDByMetal: Record<string, Array<number | null>> = {};

  for (const metal of payableMetals) {
    const cfg = streamsByMetal[metal];
    if (!cfg) {
      effectivePayableQtyByMetal[metal] = [...input.payableQtyByMetal[metal]];
      deliveredQtyByMetal[metal] = new Array(expectedLength).fill(0);
      streamValueUSDByMetal[metal] = new Array(expectedLength).fill(0);
      continue;
    }

    const streamOutput = applyStreamMVI({
      masterN: input.masterN,
      payableQty: input.payableQtyByMetal[metal],
      spotPriceUSDPerUnit: input.spotPriceUSDByMetal[metal],
      config: cfg,
    });

    effectivePayableQtyByMetal[metal] = streamOutput.effectivePayableQty;
    deliveredQtyByMetal[metal] = streamOutput.deliveredQty;
    streamValueUSDByMetal[metal] = streamOutput.streamTakeUSD;
  }

  return {
    effectivePayableQtyByMetal,
    deliveredQtyByMetal,
    streamValueUSDByMetal,
  };
}
