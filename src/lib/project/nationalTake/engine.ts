import { computeProjectPhase1 } from '../phase1.js';
import { computeTakeEngine } from '../take/compute.js';
import type { NationalTakeInput, NationalTakeOutput } from './types.js';

function assertSeriesLength(series: unknown[], expectedLength: number, fieldName: string): void {
  if (series.length !== expectedLength) {
    throw new Error(`${fieldName} length must equal masterN+1`);
  }
}

function zeroSeries(length: number): number[] {
  return new Array(length).fill(0);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function anyNonNull(series: Array<number | null> | undefined): boolean {
  if (!series) {
    return false;
  }
  return series.some((value) => value !== null);
}

export function computeNationalTake(input: NationalTakeInput): NationalTakeOutput {
  const expectedLength = input.masterN + 1;

  assertSeriesLength(input.grossRevenueUSD, expectedLength, 'grossRevenueUSD');
  if (input.byMetalRevenueUSD) {
    for (const [metal, series] of Object.entries(input.byMetalRevenueUSD)) {
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
  if (input.phase1.royaltiesUSD) {
    assertSeriesLength(input.phase1.royaltiesUSD, expectedLength, 'phase1.royaltiesUSD');
  }

  const extraRoyaltiesUSD = input.extraRoyaltiesUSD ?? zeroSeries(expectedLength);
  assertSeriesLength(extraRoyaltiesUSD, expectedLength, 'extraRoyaltiesUSD');

  const takeOut = computeTakeEngine({
    masterN: input.masterN,
    grossRevenueUSD: input.grossRevenueUSD,
    revenueByMetalUSD: input.byMetalRevenueUSD ?? undefined,
    takeItems: input.items,
  });

  const royaltiesEffective = anyNonNull(input.phase1.royaltiesUSD)
    ? (input.phase1.royaltiesUSD as Array<number | null>)
    : takeOut.totalTakeUSD;

  const totalRoyaltiesUSD = new Array<number | null>(expectedLength).fill(0);
  for (let t = 0; t < expectedLength; t += 1) {
    const left = royaltiesEffective[t];
    const right = extraRoyaltiesUSD[t];
    totalRoyaltiesUSD[t] = isFiniteNumber(left) && isFiniteNumber(right) ? left + right : null;
  }

  const phase1Out = computeProjectPhase1({
    ...input.phase1,
    masterN: input.masterN,
    revenueUSD: input.grossRevenueUSD,
    royaltiesUSD: totalRoyaltiesUSD,
  });

  return {
    totalTakeUSD: takeOut.totalTakeUSD,
    totalRoyaltiesUSD,
    phase1: phase1Out,
    itemTakeUSDById: takeOut.itemTakeUSDById,
  };
}
