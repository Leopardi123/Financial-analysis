import type { ProjectPhase1Input, ProjectPhase1Output } from '../types.ts';
import type { RoyaltyDetailMVI } from '../royalties/mvi.ts';

export type NationalTakeInput = {
  masterN: number;
  grossRevenueUSD: (number | null)[];
  byMetalRevenueUSD?: Record<string, (number | null)[]> | null;
  spotPriceUSDByMetal?: Record<string, (number | null)[]> | null;
  priceSeriesByKey?: Record<string, (number | null)[]> | null;
  priceKeyByMetal?: Record<string, string> | null;
  auPriceKey?: string | null;
  items: unknown[];
  royaltiesDetail?: Array<RoyaltyDetailMVI> | null;
  phase1: Omit<ProjectPhase1Input, 'revenueUSD' | 'royaltiesUSD'> & {
    royaltiesUSD?: (number | null)[];
  };
  extraRoyaltiesUSD?: (number | null)[];
};

export type NationalTakeOutput = {
  totalTakeUSD: (number | null)[];
  totalRoyaltiesUSD: (number | null)[];
  phase1: ProjectPhase1Output;
  itemTakeUSDById: Record<string, (number | null)[]>;
  diagnostics: string[];
};
