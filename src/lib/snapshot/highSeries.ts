export function buildCanonicalHighSeries(input: {
  rollingDcfSeries: Array<number | null>;
  productionStartPeriod: number;
  discountRate: number;
}): Array<number | null> {
  const { rollingDcfSeries, productionStartPeriod: tp, discountRate: r } = input;
  const anchor = rollingDcfSeries[tp] ?? null;
  return rollingDcfSeries.map((rolling, period) => {
    if (period >= tp) return rolling;
    if (anchor === null || !Number.isFinite(anchor)) return null;
    return anchor / ((1 + r) ** (tp - period));
  });
}
