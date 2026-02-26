import type { ProjectPhase1Input, ProjectPhase1Output } from '../types.ts';
import type { ProjectTakeMVIInput } from '../take/types.ts';

export type NationalTakeInput = {
  masterN: number;
  grossRevenueUSD: (number | null)[];
  byMetalRevenueUSD?: Record<string, (number | null)[]> | null;
  items: ProjectTakeMVIInput['items'];
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
};
