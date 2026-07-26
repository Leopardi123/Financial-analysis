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
