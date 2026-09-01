export type PreRevenueValuationSnapshot = {
  NAV_today_TargetCurrency?: number | null;
  financing?: {
    shares_post_financing?: number | null;
  } | null;
  corporateValuationTimeSeries?: {
    rows?: Array<{
      evEbitda6xPerShare?: number | null;
    }> | null;
  } | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function normalizeManualExtraShares(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function preRevenuePostFinancingShares(
  snapshot: PreRevenueValuationSnapshot,
  manualExtraShares: number,
): number | null {
  const modeled = snapshot.financing?.shares_post_financing;
  if (!finite(modeled) || modeled <= 0) return null;
  return modeled + normalizeManualExtraShares(manualExtraShares);
}

export function preRevenueExtraShareScale(
  snapshot: PreRevenueValuationSnapshot,
  manualExtraShares: number,
): number {
  const extra = normalizeManualExtraShares(manualExtraShares);
  if (extra === 0) return 1;
  const modeled = snapshot.financing?.shares_post_financing;
  if (!finite(modeled) || modeled <= 0) return 1;
  return modeled / (modeled + extra);
}

export function computePreRevenuePNavPostFinancing(
  snapshot: PreRevenueValuationSnapshot,
  priceCurrentTargetCurrency: number | null,
  manualExtraShares: number,
): number | null {
  const sharesPf = preRevenuePostFinancingShares(snapshot, manualExtraShares);
  const nav = snapshot.NAV_today_TargetCurrency;
  if (!finite(priceCurrentTargetCurrency) || priceCurrentTargetCurrency < 0 || !finite(sharesPf) || sharesPf <= 0 || !finite(nav) || nav <= 0) {
    return null;
  }
  return (priceCurrentTargetCurrency * sharesPf) / nav;
}

export function computePreRevenuePeakSixTimesValuePerShare(
  snapshot: PreRevenueValuationSnapshot,
  manualExtraShares: number,
): number | null {
  const rows = snapshot.corporateValuationTimeSeries?.rows;
  if (!Array.isArray(rows)) return null;
  const scale = preRevenueExtraShareScale(snapshot, manualExtraShares);
  let peakPerShare: number | null = null;
  for (const row of rows) {
    const value = row?.evEbitda6xPerShare;
    if (!finite(value)) continue;
    const adjusted = value * scale;
    peakPerShare = peakPerShare === null ? adjusted : Math.max(peakPerShare, adjusted);
  }
  return peakPerShare;
}

export function computePreRevenuePeakSixTimesVsPrice(
  snapshot: PreRevenueValuationSnapshot,
  priceCurrentTargetCurrency: number | null,
  manualExtraShares: number,
): number | null {
  if (!finite(priceCurrentTargetCurrency) || priceCurrentTargetCurrency <= 0) return null;
  const peakPerShare = computePreRevenuePeakSixTimesValuePerShare(snapshot, manualExtraShares);
  return peakPerShare === null ? null : peakPerShare / priceCurrentTargetCurrency;
}
