import type { StreamMVIConfig } from '../streams/types.ts';

export type ProjectRevenueInput = {
  masterN: number;
  payableQtyByMetal: Record<string, (number | null)[]>;
  priceUSDByMetal: Record<string, (number | null)[]>;
  streamsByMetal?: Record<string, StreamMVIConfig> | null;
};

export type ProjectRevenueOutput = {
  byMetalRevenueUSD: Record<string, (number | null)[]>;
  grossRevenueUSD: (number | null)[];
  deliveredQtyByMetal: Record<string, (number | null)[]>;
  streamCostToProjectUSDByMetal: Record<string, (number | null)[]>;
};
