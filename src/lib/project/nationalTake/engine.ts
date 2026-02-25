import { computeProjectPhase1 } from '../phase1.ts';
import { computeProjectTakeMVI } from '../take/engine.ts';
import type { NationalTakeInput, NationalTakeOutput } from './types.ts';

function assertSeriesLength(series: unknown[], expectedLength: number, fieldName: string): void {
  if (series.length !== expectedLength) {
    throw new Error(`${fieldName} length must equal masterN+1`);
  }
}

function zeroSeries(length: number): number[] {
  return new Array(length).fill(0);
}

function strictAdd(left: number | null, right: number | null): number | null {
  if (left == null || right == null) {
    return null;
  }

  return left + right;
}

export function computeNationalTake(input: NationalTakeInput): NationalTakeOutput {
  const expectedLength = input.masterN + 1;

  assertSeriesLength(input.grossRevenueUSD, expectedLength, 'grossRevenueUSD');

  const byMetalRevenue = input.byMetalRevenueUSD ?? null;
  if (byMetalRevenue) {
    for (const [metal, series] of Object.entries(byMetalRevenue)) {
      assertSeriesLength(series, expectedLength, `byMetalRevenueUSD[${metal}]`);
    }
  }

  assertSeriesLength(input.phase1.capexUSD, expectedLength, 'phase1.capexUSD');
  assertSeriesLength(input.phase1.operatingCostsUSD, expectedLength, 'phase1.operatingCostsUSD');
  assertSeriesLength(input.phase1.sustainingCapexUSD, expectedLength, 'phase1.sustainingCapexUSD');
  assertSeriesLength(input.phase1.siteGandA_USD, expectedLength, 'phase1.siteGandA_USD');
  assertSeriesLength(input.phase1.reclamationUSD, expectedLength, 'phase1.reclamationUSD');
  if (input.phase1.byproductCreditsUSD) {
    assertSeriesLength(input.phase1.byproductCreditsUSD, expectedLength, 'phase1.byproductCreditsUSD');
  }

  const revenueItems = input.items.filter((item) => item.base.baseType === 'REVENUE');
  const profitItems = input.items.filter((item) => item.base.baseType === 'OPERATING_PROFIT');

  const revenueTakeOut = computeProjectTakeMVI({
    masterN: input.masterN,
    grossRevenueUSD: input.grossRevenueUSD,
    byMetalRevenueUSD: byMetalRevenue,
    items: revenueItems,
  });

  const zeros = zeroSeries(expectedLength);
  const phase1Pre = computeProjectPhase1({
    ...input.phase1,
    masterN: input.masterN,
    revenueUSD: revenueTakeOut.netRevenueAfterTakeUSD,
    royaltiesUSD: zeros,
  });

  const profitTakeOut = computeProjectTakeMVI({
    masterN: input.masterN,
    grossRevenueUSD: input.grossRevenueUSD,
    byMetalRevenueUSD: byMetalRevenue,
    operatingProfitUSD: phase1Pre.ebitUSD,
    items: profitItems,
  });

  const totalTakeUSD = new Array<number | null>(expectedLength).fill(0);
  for (let t = 0; t < expectedLength; t += 1) {
    totalTakeUSD[t] = strictAdd(revenueTakeOut.totalTakeUSD[t], profitTakeOut.totalTakeUSD[t]);
  }

  const finalPhase1 = computeProjectPhase1({
    ...input.phase1,
    masterN: input.masterN,
    revenueUSD: revenueTakeOut.netRevenueAfterTakeUSD,
    royaltiesUSD: totalTakeUSD,
  });

  return {
    revenueTakeUSD: revenueTakeOut.totalTakeUSD,
    profitTakeUSD: profitTakeOut.totalTakeUSD,
    totalTakeUSD,
    netRevenueAfterRevenueTakeUSD: revenueTakeOut.netRevenueAfterTakeUSD,
    phase1: finalPhase1,
    revenueTakeByItemUSD: revenueTakeOut.takeByItemUSD,
    profitTakeByItemUSD: profitTakeOut.takeByItemUSD,
  };
}
