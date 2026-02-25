import type { ProjectPhase1Input, ProjectPhase1Output } from '../types.ts';
import type { ProjectTakeMVIInput } from '../take/types.ts';

export type NationalTakeInput = {
  masterN: number;

  // Revenue basis (gross revenue + optional byMetalRevenue)
  grossRevenueUSD: (number | null)[];
  byMetalRevenueUSD?: Record<string, (number | null)[]> | null;

  // Take items, mixed types allowed
  items: ProjectTakeMVIInput['items'];

  // Phase1 inputs excluding revenueUSD and royaltiesUSD (wrapper supplies both)
  phase1: Omit<ProjectPhase1Input, 'revenueUSD' | 'royaltiesUSD'> & {
    royaltiesUSD?: never;
  };

  // Additional royalties to include in final Phase1 only (e.g., stream take)
  extraRoyaltiesUSD?: (number | null)[];
};

export type NationalTakeOutput = {
  // Split takes
  revenueTakeUSD: (number | null)[];
  profitTakeUSD: (number | null)[];
  totalTakeUSD: (number | null)[];
  totalRoyaltiesUSD: (number | null)[];

  // Net revenue after revenue-take (NOT after profit-take)
  netRevenueAfterRevenueTakeUSD: (number | null)[];

  // Phase1 output computed with revenueUSD = netRevenueAfterRevenueTakeUSD and royaltiesUSD = totalTakeUSD
  phase1: ProjectPhase1Output;

  // Debug by-item
  revenueTakeByItemUSD: Record<string, (number | null)[]>;
  profitTakeByItemUSD: Record<string, (number | null)[]>;
};
