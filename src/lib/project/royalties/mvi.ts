export type RoyaltyDetailMVI = {
  id?: string;
  label?: string;
  base?: string | null;
  rateType?: string | null;
  rate?: number | null;
};

export type ComputeRoyaltiesFromDetailInput = {
  grossRevenueUSD: Array<number | null>;
  royaltiesDetail?: Array<RoyaltyDetailMVI> | null;
};

export type ComputeRoyaltiesFromDetailOutput = {
  royaltiesUSD_calc: Array<number | null>;
  itemBreakdown: Record<string, Array<number | null>>;
  diagnostics: string[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function computeRoyaltiesFromDetail(
  input: ComputeRoyaltiesFromDetailInput,
): ComputeRoyaltiesFromDetailOutput {
  const diagnostics: string[] = [];
  const royaltiesUSD_calc = new Array<number | null>(input.grossRevenueUSD.length).fill(0);
  const itemBreakdown: Record<string, Array<number | null>> = {};

  for (const detail of input.royaltiesDetail ?? []) {
    const base = detail.base ?? null;
    const rateType = detail.rateType ?? null;
    if (base !== 'revenue' || rateType !== 'NSR_pct') {
      diagnostics.push(`royaltiesDetail: unsupported item base=${String(base)} rateType=${String(rateType)}; ignored`);
      continue;
    }

    const ratePct = isFiniteNumber(detail.rate) ? detail.rate : null;
    const rateFraction = ratePct === null ? null : ratePct / 100;
    const itemSeries = new Array<number | null>(input.grossRevenueUSD.length).fill(null);

    for (let t = 0; t < input.grossRevenueUSD.length; t += 1) {
      const gross = input.grossRevenueUSD[t];
      if (gross === null) {
        itemSeries[t] = null;
        royaltiesUSD_calc[t] = null;
        diagnostics.push(`royaltiesUSD: cannot compute at t=${t} because grossRevenueUSD missing`);
        continue;
      }

      if (rateFraction === null) {
        itemSeries[t] = null;
        royaltiesUSD_calc[t] = null;
        continue;
      }

      const itemRoyalty = gross * rateFraction;
      itemSeries[t] = itemRoyalty;

      const prior = royaltiesUSD_calc[t];
      royaltiesUSD_calc[t] = isFiniteNumber(prior) ? prior + itemRoyalty : null;
    }

    itemBreakdown[detail.id ?? `item_${Object.keys(itemBreakdown).length + 1}`] = itemSeries;
  }

  return {
    royaltiesUSD_calc,
    itemBreakdown,
    diagnostics,
  };
}
