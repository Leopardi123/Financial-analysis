import { useMemo } from "react";

type ValueRangeSnapshotCardProps = {
  priceToday?: number | null;
  npvLow?: number | null;
  npvHigh?: number | null;
  tpLow?: number | null;
  tpHigh?: number | null;
  tpSeries?: Array<{ label: string; low: number | null; high: number | null }>;
  currencyCode?: string;
};

const Y_TOP = 20;
const Y_BOTTOM = 100;
const VIEWBOX_WIDTH = 320;
const VIEWBOX_HEIGHT = 120;
const X_LEFT = 110;
const X_RIGHT = 250;
const X_SERIES_START = 200;
const X_SERIES_END = 285;
const MIN_LABEL_SPACING = 12;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatPerShareValue(value: number): string {
  const digits = Math.abs(value) < 100 ? 1 : 0;
  return value.toLocaleString("sv-SE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function resolveLabelPair(highY: number | null, lowY: number | null): { high: number; low: number } | null {
  if (highY === null || lowY === null) return null;
  let high = clamp(highY, Y_TOP, Y_BOTTOM);
  let low = clamp(lowY, Y_TOP, Y_BOTTOM);
  if (low - high < MIN_LABEL_SPACING) {
    const middle = (high + low) / 2;
    high = middle - MIN_LABEL_SPACING / 2;
    low = middle + MIN_LABEL_SPACING / 2;
    if (high < Y_TOP) {
      high = Y_TOP;
      low = Y_TOP + MIN_LABEL_SPACING;
    }
    if (low > Y_BOTTOM) {
      low = Y_BOTTOM;
      high = Y_BOTTOM - MIN_LABEL_SPACING;
    }
  }
  return { high, low };
}

export default function ValueRangeSnapshotCard(props: ValueRangeSnapshotCardProps) {
  const {
    priceToday,
    npvLow,
    npvHigh,
    tpLow,
    tpHigh,
    tpSeries,
  } = props;

  const npvRange = useMemo(() => {
    const low = isFiniteNumber(npvLow) ? npvLow : null;
    const high = isFiniteNumber(npvHigh) ? npvHigh : null;
    if (low !== null && high !== null) return { low: Math.min(low, high), high: Math.max(low, high) };
    if (low !== null) return { low, high: low };
    if (high !== null) return { low: high, high };
    return null;
  }, [npvLow, npvHigh]);

  const tpRange = useMemo(() => {
    if (Array.isArray(tpSeries) && tpSeries.length > 0) {
      const ranges = tpSeries
        .map((entry) => {
          const low = isFiniteNumber(entry.low) ? entry.low : null;
          const high = isFiniteNumber(entry.high) ? entry.high : null;
          if (low !== null && high !== null) return { label: entry.label, low: Math.min(low, high), high: Math.max(low, high) };
          if (low !== null) return { label: entry.label, low, high: low };
          if (high !== null) return { label: entry.label, low: high, high };
          return { label: entry.label, low: null, high: null };
        })
        .filter((entry) => entry.low !== null && entry.high !== null) as Array<{ label: string; low: number; high: number }>;
      if (ranges.length > 0) {
        return ranges;
      }
    }
    const low = isFiniteNumber(tpLow) ? tpLow : null;
    const high = isFiniteNumber(tpHigh) ? tpHigh : null;
    if (low !== null && high !== null) return [{ label: "tp", low: Math.min(low, high), high: Math.max(low, high) }];
    if (low !== null) return [{ label: "tp", low, high: low }];
    if (high !== null) return [{ label: "tp", low: high, high }];
    return [];
  }, [tpHigh, tpLow, tpSeries]);

  const points = useMemo(() => {
    const domain = [
      priceToday,
      npvRange?.low,
      npvRange?.high,
      ...tpRange.flatMap((entry) => [entry.low, entry.high]),
    ].filter(isFiniteNumber);
    const min = domain.length > 0 ? Math.min(...domain) : null;
    const max = domain.length > 0 ? Math.max(...domain) : null;

    const toY = (value: number | null): number | null => {
      if (value === null || min === null || max === null) return null;
      if (max === min) return 60;
      const t = (value - min) / (max - min);
      const y = Y_BOTTOM + (Y_TOP - Y_BOTTOM) * t;
      return clamp(y, Y_TOP, Y_BOTTOM);
    };

    return {
      npvLowY: toY(npvRange?.low ?? null),
      npvHighY: toY(npvRange?.high ?? null),
      tpSeriesY: tpRange.map((entry) => ({
        label: entry.label,
        lowY: toY(entry.low),
        highY: toY(entry.high),
        low: entry.low,
        high: entry.high,
      })),
      priceY: toY(isFiniteNumber(priceToday) ? priceToday : null),
    };
  }, [npvRange, priceToday, tpRange]);

  const hasNpv = npvRange !== null && points.npvLowY !== null && points.npvHighY !== null;
  const hasTp = points.tpSeriesY.some((entry) => entry.lowY !== null && entry.highY !== null);
  const hasPrice = isFiniteNumber(priceToday) && points.priceY !== null;
  const npvLabels = resolveLabelPair(points.npvHighY, points.npvLowY);
  const tpFirst = points.tpSeriesY[0] ?? null;
  const tpLabels = tpFirst ? resolveLabelPair(tpFirst.highY, tpFirst.lowY) : null;
  const tpSeriesX = points.tpSeriesY.map((entry, index, arr) => ({
    ...entry,
    x: arr.length === 1 ? X_RIGHT : X_SERIES_START + ((X_SERIES_END - X_SERIES_START) * index) / Math.max(1, arr.length - 1),
  }));

  const priceLabel = useMemo(() => {
    if (!hasPrice || points.priceY === null || priceToday === null || !Number.isFinite(priceToday)) return null;
    const yBase = clamp(points.priceY + 4, Y_TOP, Y_BOTTOM);
    const tooCloseToRange = (npvLabels !== null && Math.abs(yBase - npvLabels.high) < 10)
      || (npvLabels !== null && Math.abs(yBase - npvLabels.low) < 10)
      || (tpLabels !== null && Math.abs(yBase - tpLabels.high) < 10)
      || (tpLabels !== null && Math.abs(yBase - tpLabels.low) < 10);
    const y = tooCloseToRange ? clamp(points.priceY - 8, Y_TOP, Y_BOTTOM) : yBase;
    return {
      x: 90,
      y,
      text: formatPerShareValue(priceToday),
    };
  }, [hasPrice, npvLabels, points.priceY, priceToday, tpLabels]);

  return (
    <div>
      {!hasNpv && !hasTp ? (
        <p className="status empty" style={{ margin: 0 }}>Saknar intervall-data (NPV/TP)</p>
      ) : (
        <div className="project-value-snapshot-wrap">
          <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="img" aria-label="Snapshot med NPV- och TP-intervall per aktie" style={{ width: "100%", height: "100%" }}>
            <rect x={92} y={14} width={36} height={92} rx={10} fill="rgba(15, 23, 42, 0.05)" />
            <rect x={232} y={14} width={36} height={92} rx={10} fill="rgba(15, 23, 42, 0.05)" />
            <line x1={0} y1={110} x2={320} y2={110} stroke="rgba(15, 23, 42, 0.14)" strokeWidth={1} />

            <text x={12} y={26} fontSize={10} fill="#6b7280">Nu</text>
            <text x={238} y={26} fontSize={10} fill="#6b7280">Då</text>

            {hasNpv && hasTp && tpSeriesX[0] && tpSeriesX[tpSeriesX.length - 1] && (
              <polygon
                points={`${X_LEFT},${points.npvHighY!} ${tpSeriesX[tpSeriesX.length - 1].x},${tpSeriesX[0].highY!} ${tpSeriesX[tpSeriesX.length - 1].x},${tpSeriesX[0].lowY!} ${X_LEFT},${points.npvLowY!}`}
                fill="rgba(71, 85, 105, 0.14)"
                stroke="rgba(71, 85, 105, 0.26)"
                strokeWidth={1}
              />
            )}

            {hasNpv ? (
              <>
                <line x1={X_LEFT} y1={points.npvHighY!} x2={X_LEFT} y2={points.npvLowY!} stroke="#64748b" strokeWidth={10} strokeLinecap="round" />
                {npvLabels && (
                  <>
                    <text x={82} y={npvLabels.high + 4} fontSize={11} fill="#1f2937" textAnchor="end">{formatPerShareValue(npvRange.high)}</text>
                    <text x={82} y={npvLabels.low + 4} fontSize={11} fill="#1f2937" textAnchor="end">{formatPerShareValue(npvRange.low)}</text>
                  </>
                )}
              </>
            ) : (
              <text x={82} y={64} fontSize={11} fill="#6b7280" textAnchor="end">n/a</text>
            )}

            {hasTp ? (
              <>
                {tpSeriesX.map((entry, idx) => (
                  entry.lowY !== null && entry.highY !== null
                    ? <line key={`tp-${entry.label}-${idx}`} x1={entry.x} y1={entry.highY} x2={entry.x} y2={entry.lowY} stroke="#64748b" strokeWidth={10} strokeLinecap="round" />
                    : null
                ))}
                {tpSeriesX.map((entry, idx) => (
                  entry.lowY !== null && entry.highY !== null
                    ? <text key={`tp-label-${entry.label}-${idx}`} x={entry.x + 8} y={Math.min(entry.lowY + 14, 108)} fontSize={9} fill="#6b7280">{entry.label}</text>
                    : null
                ))}
              </>
            ) : (
              <text x={270} y={64} fontSize={11} fill="#6b7280">n/a</text>
            )}

            {hasPrice && priceLabel && (
              <>
                <circle cx={X_LEFT} cy={points.priceY!} r={4} fill="#dc2626" stroke="#ffffff" strokeWidth={1.25} />
                <text x={priceLabel.x} y={priceLabel.y} fontSize={11} fill="#dc2626" textAnchor="end">{priceLabel.text}</text>
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
