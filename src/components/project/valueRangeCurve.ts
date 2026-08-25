export type ValueRangeCurveInput = {
  totalLen: number;
  tpOffset: number;
  discountRate: number;
  lowTp: number | null;
  highTp: number | null;
  /** Rolling NAV values aligned to economic period 0..N. */
  navSeriesRaw: Array<number | null>;
  /** Rolling ex-CAPEX DCF values aligned to economic period 0..N. */
  dcfExCapexSeriesRaw: Array<number | null>;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Canonical Project chart curve generation, shared verbatim by Corporate presentation. */
export function buildValueRangeCurve(input: ValueRangeCurveInput) {
  const high: Array<number | null> = Array.from({ length: input.totalLen }, () => null);
  const low: Array<number | null> = Array.from({ length: input.totalLen }, () => null);
  for (let index = 0; index < input.totalLen; index += 1) {
    low[index] = finite(input.navSeriesRaw[index]) ? input.navSeriesRaw[index] : null;
    if (index < input.tpOffset) {
      high[index] = input.highTp === null ? null : input.highTp / ((1 + input.discountRate) ** (input.tpOffset - index));
    } else high[index] = finite(input.dcfExCapexSeriesRaw[index]) ? input.dcfExCapexSeriesRaw[index] : null;
  }
  if (input.lowTp !== null) low[input.tpOffset] = input.lowTp;
  if (input.highTp !== null) high[input.tpOffset] = input.highTp;
  return { low, high };
}

export function buildValueRangeChartRow(input: {
  year: number;
  low: number | null;
  high: number | null;
  currentPrice: number | null;
  annotateCurrent: boolean;
  annotateProductionStart: boolean;
  format: (value: number) => string;
  currentPriceAnnotation?: string | null;
  highlightPeak?: boolean;
  highlightPeakLow?: boolean;
  highlightPeakHigh?: boolean;
  peakTooltip?: string | null;
  productionStartLowAnnotation?: string | null;
  productionStartHighAnnotation?: string | null;
  productionStartTooltip?: string | null;
  currentLowValue?: number | null;
  currentHighValue?: number | null;
  productionStartLowValue?: number | null;
  productionStartHighValue?: number | null;
}) {
  // `low` and `high` are economic identities (NAV and DCF), not guaranteed
  // geometric ordering. The stacked area must therefore use min/max geometry
  // while the boundary columns preserve the original NAV/DCF identities.
  const economicLow = input.low;
  const economicHigh = input.high;
  const geometricBase = finite(economicLow) && finite(economicHigh)
    ? Math.min(economicLow, economicHigh)
    : null;
  const geometricBand = finite(economicLow) && finite(economicHigh)
    ? Math.abs(economicHigh - economicLow)
    : null;
  const annotation = (value: number | null) => value === null ? null : `      ${input.format(value)}`;
  const current = input.annotateCurrent ? input.currentPrice : null;
  return [
    input.year, geometricBase, geometricBand, economicLow, economicHigh,
    current, current === null ? null : input.currentPriceAnnotation === undefined ? annotation(current) : input.currentPriceAnnotation,
    input.annotateCurrent ? input.currentLowValue ?? economicLow : null, input.annotateCurrent ? annotation(input.currentLowValue ?? economicLow) : null,
    input.annotateCurrent ? input.currentHighValue ?? economicHigh : null, input.annotateCurrent ? annotation(input.currentHighValue ?? economicHigh) : null,
    input.annotateProductionStart ? input.productionStartLowValue ?? input.low : null, input.annotateProductionStart ? input.productionStartLowAnnotation === undefined ? annotation(input.productionStartLowValue ?? input.low) : input.productionStartLowAnnotation : null, input.annotateProductionStart ? input.productionStartTooltip ?? null : null,
    input.annotateProductionStart ? input.productionStartHighValue ?? input.high : null, input.annotateProductionStart ? input.productionStartHighAnnotation === undefined ? annotation(input.productionStartHighValue ?? input.high) : input.productionStartHighAnnotation : null, input.annotateProductionStart ? input.productionStartTooltip ?? null : null,
    (input.highlightPeakLow ?? input.highlightPeak) ? economicLow : null, (input.highlightPeakLow ?? input.highlightPeak) ? annotation(economicLow) : null, (input.highlightPeakLow ?? input.highlightPeak) ? input.peakTooltip ?? null : null,
    (input.highlightPeakHigh ?? input.highlightPeak) ? economicHigh : null, (input.highlightPeakHigh ?? input.highlightPeak) ? annotation(economicHigh) : null, (input.highlightPeakHigh ?? input.highlightPeak) ? input.peakTooltip ?? null : null,
  ];
}

export type ValueRangePeak = { index: number; year: number; high: number; low: number | null };

/** Finds the first maximum High value. Keeping this here gives both chart modes identical peak semantics. */
export function findFirstHighPeak(rows: Array<{ year: number; high: number | null; low: number | null }>): ValueRangePeak | null {
  let peak: ValueRangePeak | null = null;
  rows.forEach((row, index) => {
    if (!finite(row.high)) return;
    if (peak === null || row.high > peak.high) peak = { index, year: row.year, high: row.high, low: finite(row.low) ? row.low : null };
  });
  return peak;
}

export function formatPeakTooltip(peak: Pick<ValueRangePeak, 'year' | 'high' | 'low'>, format: (value: number) => string, currencyCode?: string): string {
  const unit = currencyCode ? ` ${currencyCode}` : '';
  const value = (number: number | null) => number === null ? 'n/a' : `${format(number)}${unit}`;
  return `År: ${peak.year}\nHigh: ${value(peak.high)}\nLow: ${value(peak.low)}`;
}
