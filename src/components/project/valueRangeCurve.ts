export type ValueRangeCurveInput = {
  totalLen: number;
  tpOffset: number;
  lowToday: number | null;
  highToday: number | null;
  lowTp: number | null;
  highTp: number | null;
  navSeriesRaw: Array<number | null>;
  dcfPresentSeriesRaw: Array<number | null>;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Canonical Project chart curve generation, shared verbatim by Corporate presentation. */
export function buildValueRangeCurve(input: ValueRangeCurveInput) {
  const dcfAtTp = finite(input.dcfPresentSeriesRaw[0]) ? input.dcfPresentSeriesRaw[0] : null;
  const inferredRate = (() => {
    if (input.tpOffset <= 0 || input.highTp === null || dcfAtTp === null || dcfAtTp <= 0 || input.highTp <= 0) return null;
    const rate = (input.highTp / dcfAtTp) ** (1 / input.tpOffset) - 1;
    return Number.isFinite(rate) && rate > -1 ? rate : null;
  })();
  const high: Array<number | null> = Array.from({ length: input.totalLen }, () => null);
  const low: Array<number | null> = Array.from({ length: input.totalLen }, () => null);
  for (let index = 0; index < input.totalLen; index += 1) {
    if (index <= input.tpOffset) {
      if (input.highTp !== null) {
        if (inferredRate !== null) high[index] = input.highTp / ((1 + inferredRate) ** (input.tpOffset - index));
        else {
          const start = input.highToday ?? input.highTp;
          high[index] = start + (input.highTp - start) * (index / Math.max(1, input.tpOffset));
        }
      }
      if (input.lowTp !== null) {
        if (input.lowToday !== null && input.lowToday > 0 && input.lowTp > 0) {
          const growth = (input.lowTp / input.lowToday) ** (1 / Math.max(1, input.tpOffset)) - 1;
          low[index] = input.lowToday * ((1 + growth) ** index);
        } else if (input.lowToday !== null) low[index] = input.lowToday + (input.lowTp - input.lowToday) * (index / Math.max(1, input.tpOffset));
        else low[index] = input.lowTp;
      }
    } else {
      const flowIndex = index - input.tpOffset;
      low[index] = finite(input.navSeriesRaw[flowIndex]) ? input.navSeriesRaw[flowIndex] : null;
      const dcf = finite(input.dcfPresentSeriesRaw[flowIndex]) ? input.dcfPresentSeriesRaw[flowIndex] : null;
      high[index] = dcf === null ? null : inferredRate === null ? dcf : dcf * ((1 + inferredRate) ** flowIndex);
    }
  }
  if (input.lowTp !== null) low[input.tpOffset] = input.lowTp;
  if (input.highTp !== null) high[input.tpOffset] = input.highTp;
  return { low, high, inferredRate };
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
  peakTooltip?: string | null;
}) {
  const orderedLow = input.low !== null && input.high !== null ? Math.min(input.low, input.high) : input.low;
  const orderedHigh = input.low !== null && input.high !== null ? Math.max(input.low, input.high) : input.high;
  const annotation = (value: number | null) => value === null ? null : `      ${input.format(value)}`;
  const current = input.annotateCurrent ? input.currentPrice : null;
  return [
    input.year, orderedLow, orderedLow !== null && orderedHigh !== null ? orderedHigh - orderedLow : null, orderedLow, orderedHigh,
    current, current === null ? null : input.currentPriceAnnotation === undefined ? annotation(current) : input.currentPriceAnnotation,
    input.annotateCurrent ? orderedLow : null, input.annotateCurrent ? annotation(orderedLow) : null,
    input.annotateCurrent ? orderedHigh : null, input.annotateCurrent ? annotation(orderedHigh) : null,
    input.annotateProductionStart ? input.low : null, input.annotateProductionStart ? annotation(input.low) : null,
    input.annotateProductionStart ? input.high : null, input.annotateProductionStart ? annotation(input.high) : null,
    input.highlightPeak ? orderedLow : null, input.highlightPeak ? annotation(orderedLow) : null, input.highlightPeak ? input.peakTooltip ?? null : null,
    input.highlightPeak ? orderedHigh : null, input.highlightPeak ? annotation(orderedHigh) : null, input.highlightPeak ? input.peakTooltip ?? null : null,
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
