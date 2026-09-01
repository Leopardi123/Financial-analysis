import { applyStreamMVI } from './engine.ts';
import type { StreamMVIConfig } from './types.ts';

type ApplyStreamsMVIArgs = {
  masterN: number;
  payableQtyByMetal: Record<string, (number | null)[]>;
  spotPriceUSDByMetal: Record<string, (number | null)[]>;
  streamsByMetal: Record<string, StreamMVIConfig> | null | undefined;
};

type ApplyStreamsMVIResult = {
  preStreamPayableQtyByMetal: Record<string, (number | null)[]>;
  effectivePayableQtyByMetal: Record<string, (number | null)[]>;
  deliveredQtyByMetal: Record<string, (number | null)[]>;
  streamPurchasePriceUSDByMetal: Record<string, (number | null)[]>;
  streamPurchaseRevenueUSDByMetal: Record<string, (number | null)[]>;
  streamCostToProjectUSDByMetal: Record<string, (number | null)[]>;
  diagnostics: string[];
};

export function applyStreamsMVI(args: ApplyStreamsMVIArgs): ApplyStreamsMVIResult {
  const expectedLength = args.masterN + 1;
  const streams = args.streamsByMetal ?? {};
  const diagnostics: string[] = [];
  const preStreamPayableQtyByMetal: Record<string, (number | null)[]> = {};
  const effectivePayableQtyByMetal: Record<string, (number | null)[]> = {};
  const deliveredQtyByMetal: Record<string, (number | null)[]> = {};
  const streamPurchasePriceUSDByMetal: Record<string, (number | null)[]> = {};
  const streamPurchaseRevenueUSDByMetal: Record<string, (number | null)[]> = {};
  const streamCostToProjectUSDByMetal: Record<string, (number | null)[]> = {};

  for (const metal of Object.keys(args.payableQtyByMetal)) {
    const payableSeries = args.payableQtyByMetal[metal];
    const spotSeries = args.spotPriceUSDByMetal[metal];
    if (!spotSeries) throw new Error(`spotPriceUSDByMetal missing required metal ${metal}`);
    if (payableSeries.length !== expectedLength || spotSeries.length !== expectedLength) throw new Error(`stream input series for ${metal} must equal masterN+1`);
    const cfg = streams[metal];
    if (!cfg) {
      preStreamPayableQtyByMetal[metal] = [...payableSeries];
      effectivePayableQtyByMetal[metal] = [...payableSeries];
      deliveredQtyByMetal[metal] = new Array(expectedLength).fill(0);
      streamPurchasePriceUSDByMetal[metal] = new Array(expectedLength).fill(0);
      streamPurchaseRevenueUSDByMetal[metal] = new Array(expectedLength).fill(0);
      streamCostToProjectUSDByMetal[metal] = new Array(expectedLength).fill(0);
      continue;
    }

    const out = applyStreamMVI({ masterN: args.masterN, payableQty: payableSeries, spotPriceUSDPerUnit: spotSeries, config: cfg });
    preStreamPayableQtyByMetal[metal] = out.preStreamPayableQty;
    effectivePayableQtyByMetal[metal] = out.effectivePayableQty;
    deliveredQtyByMetal[metal] = out.deliveredQty;
    streamPurchasePriceUSDByMetal[metal] = out.purchasePriceUSDPerUnit;
    streamPurchaseRevenueUSDByMetal[metal] = out.streamPurchaseRevenueUSD;
    streamCostToProjectUSDByMetal[metal] = out.streamTakeUSD;
    diagnostics.push(`stream metal=${metal} deliveryMode=${cfg.deliveryMode ?? 'PCT_OF_PAYABLE'} inputPayableBasis=${cfg.inputPayableBasis ?? 'PRE_STREAM'} source=${cfg.sourceId ?? 'unspecified'}`);
  }

  for (const metal of Object.keys(streams)) {
    if (!(metal in args.payableQtyByMetal)) throw new Error(`streamsByMetal references unknown payable metal ${metal}`);
  }

  return {
    preStreamPayableQtyByMetal,
    effectivePayableQtyByMetal,
    deliveredQtyByMetal,
    streamPurchasePriceUSDByMetal,
    streamPurchaseRevenueUSDByMetal,
    streamCostToProjectUSDByMetal,
    diagnostics,
  };
}
