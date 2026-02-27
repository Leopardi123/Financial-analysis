import { computeProjectPhase1 } from '../phase1.ts';
import { computeRoyaltiesFromDetail } from '../royalties/mvi.ts';
import { computeTakeEngine } from '../take/compute.ts';
import { computeTotalTakeUSD_MVI } from '../take/computeTakeMvi.ts';
import type { TakeItemMVI } from '../take/types.ts';
import type { NationalTakeInput, NationalTakeOutput } from './types.ts';

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

function anyFinite(series: Array<number | null> | undefined): boolean {
  if (!series) {
    return false;
  }
  return series.some((value) => isFiniteNumber(value));
}

function isLegacyTakeItem(item: unknown): item is TakeItemMVI {
  return typeof item === 'object'
    && item !== null
    && typeof (item as { id?: unknown }).id === 'string'
    && Array.isArray((item as { metals?: unknown }).metals)
    && typeof (item as { baseType?: unknown }).baseType === 'string'
    && typeof (item as { rateType?: unknown }).rateType === 'string';
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

  const legacyTakeItems = input.items.filter(isLegacyTakeItem);
  const takeOut = computeTakeEngine({
    masterN: input.masterN,
    grossRevenueUSD: input.grossRevenueUSD,
    revenueByMetalUSD: input.byMetalRevenueUSD ?? undefined,
    takeItems: legacyTakeItems,
  });

  const takeMviOut = computeTotalTakeUSD_MVI({
    masterN: input.masterN,
    productionStartPeriod: input.phase1.productionStartPeriod,
    grossRevenueUSD: input.grossRevenueUSD,
    revenueByMetalUSD: input.byMetalRevenueUSD ?? undefined,
    spotPriceUSDByMetal: input.spotPriceUSDByMetal ?? undefined,
    priceSeriesByKey: input.priceSeriesByKey ?? undefined,
    priceKeyByMetal: input.priceKeyByMetal ?? undefined,
    auPriceKey: input.auPriceKey ?? undefined,
    takeItems: input.items,
  });

  const royaltiesFromDetail = computeRoyaltiesFromDetail({
    grossRevenueUSD: input.grossRevenueUSD,
    royaltiesDetail: input.royaltiesDetail,
  });

  const diagnostics = [...takeMviOut.diagnostics, ...royaltiesFromDetail.diagnostics];
  let royaltiesEffective: Array<number | null>;

  if (takeMviOut.includedCount >= 1) {
    royaltiesEffective = takeMviOut.totalTakeUSD;
    diagnostics.push(
      `takeItems: using TotalTake_USD computed from takeItems (count=${takeMviOut.includedCount}, base=REVENUE, rateType=FIXED|TIERED)`,
    );
    diagnostics.push(`takeItems: included ${takeMviOut.includedSummaries.join(', ')}`);
  } else if (anyFinite(input.phase1.royaltiesUSD)) {
    royaltiesEffective = input.phase1.royaltiesUSD as Array<number | null>;
    diagnostics.push('royaltiesUSD: manual override detected; ignoring royaltiesDetail for calculation');
  } else {
    royaltiesEffective = royaltiesFromDetail.royaltiesUSD_calc;
  }

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
    diagnostics,
  };
}
