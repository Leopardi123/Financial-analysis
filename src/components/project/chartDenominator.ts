export function rescalePerShareSeries(
  series: Array<number | null> | undefined,
  sourceShares: number | null,
  canonicalShares: number | null,
): Array<number | null> {
  const scale = sourceShares !== null && sourceShares > 0 && canonicalShares !== null && canonicalShares > 0
    ? sourceShares / canonicalShares
    : 1;
  return Array.isArray(series)
    ? series.map((value) => typeof value === 'number' && Number.isFinite(value) ? value * scale : null)
    : [];
}
