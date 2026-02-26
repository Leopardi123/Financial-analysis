import { computeTakeEngine } from './compute.ts';
import type { ProjectTakeMVIInput, ProjectTakeMVIOutput } from './types.ts';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function computeProjectTakeMVI(input: ProjectTakeMVIInput): ProjectTakeMVIOutput {
  const out = computeTakeEngine({
    masterN: input.masterN,
    grossRevenueUSD: input.grossRevenueUSD,
    revenueByMetalUSD: input.byMetalRevenueUSD ?? undefined,
    payableQtyByMetal: input.payableQtyByMetal ?? undefined,
    takeItems: input.items,
  });

  const netRevenueAfterTakeUSD = input.grossRevenueUSD.map((gross, idx) => {
    const take = out.totalTakeUSD[idx];
    if (!isFiniteNumber(gross) || !isFiniteNumber(take)) {
      return null;
    }
    return gross - take;
  });

  return {
    totalTakeUSD: out.totalTakeUSD,
    netRevenueAfterTakeUSD,
    takeByItemUSD: out.itemTakeUSDById,
  };
}
