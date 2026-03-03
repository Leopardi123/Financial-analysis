import { useMemo } from "react";

type TpMarker = {
  tp: number;
  high: number | null;
  low: number | null;
  yearLabelUsed?: string | null;
};

type ValueRangeSnapshotCardProps = {
  priceToday?: number | null;
  npvLow?: number | null;
  npvHigh?: number | null;
  tpLow?: number | null;
  tpHigh?: number | null;
  tpMarkers?: TpMarker[];
  currencyCode?: string;
};

const Y_TOP = 20;
const Y_BOTTOM = 100;
const VIEWBOX_WIDTH = 320;
const VIEWBOX_HEIGHT = 120;
const X_LEFT = 110;
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

function normalizeTpMarkers(tpMarkers: TpMarker[] | undefined, fallback: { low: number | null; high: number | null } | null): TpMarker[] {
  const normalized = (tpMarkers ?? [])
    .filter((marker) => Number.isInteger(marker.tp) && marker.tp > 0)
    .map((marker) => {
      const high = isFiniteNumber(marker.high) ? marker.high : null;
      const low = isFiniteNumber(marker.low) ? marker.low : null;
      if (high === null && low === null) {
        return { ...marker, high: null, low: null };
      }
      if (high === null) {
        return { ...marker, high: low, low };
      }
      if (low === null) {
        return { ...marker, high, low: high };
      }
      return { ...marker, high: Math.max(high, low), low: Math.min(high, low) };
    })
    .sort((a, b) => a.tp - b.tp);

  if (normalized.length > 0) return normalized;
  if (!fallback) return [];
  return [{ tp: 1, high: fallback.high, low: fallback.low }];
}

export default function ValueRangeSnapshotCard(props: ValueRangeSnapshotCardProps) {
  const {
    priceToday,
    npvLow,
    npvHigh,
    tpLow,
    tpHigh,
    tpMarkers,
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
    const low = isFiniteNumber(tpLow) ? tpLow : null;
    const high = isFiniteNumber(tpHigh) ? tpHigh : null;
    if (low !== null && high !== null) return { low: Math.min(low, high), high: Math.max(low, high) };
    if (low !== null) return { low, high: low };
    if (high !== null) return { low: high, high };
    return null;
  }, [tpLow, tpHigh]);

  const normalizedMarkers = useMemo(
    () => normalizeTpMarkers(tpMarkers, tpRange),
    [tpMarkers, tpRange],
  );

  const points = useMemo(() => {
    const tpMarkerValues = normalizedMarkers.flatMap((marker) => [marker.low, marker.high]);
    const domain = [priceToday, npvRange?.low, npvRange?.high, ...tpMarkerValues].filter(isFiniteNumber);
    const min = domain.length > 0 ? Math.min(...domain) : null;
    const max = domain.length > 0 ? Math.max(...domain) : null;

    const toY = (value: number | null): number | null => {
      if (value === null || min === null || max === null) return null;
      if (max === min) return 60;
      const t = (value - min) / (max - min);
      const y = Y_BOTTOM + (Y_TOP - Y_BOTTOM) * t;
      return clamp(y, Y_TOP, Y_BOTTOM);
    };

    const lastTp = normalizedMarkers.length > 0 ? normalizedMarkers[normalizedMarkers.length - 1].tp : null;
    const firstTp = normalizedMarkers.length > 0 ? normalizedMarkers[0].tp : null;
    const markerPoints = normalizedMarkers.map((marker, idx) => {
      let x = 245;
      if (lastTp !== null && firstTp !== null && lastTp > firstTp) {
        const ratio = (marker.tp - firstTp) / (lastTp - firstTp);
        x = clamp(220 + ratio * 50, 220, 270);
      } else if (normalizedMarkers.length > 1) {
        const step = 50 / (normalizedMarkers.length - 1);
        x = 220 + idx * step;
      }

      return {
        tp: marker.tp,
        yearLabelUsed: marker.yearLabelUsed ?? null,
        x,
        low: marker.low,
        high: marker.high,
        lowY: toY(marker.low),
        highY: toY(marker.high),
      };
    });

    return {
      npvLowY: toY(npvRange?.low ?? null),
      npvHighY: toY(npvRange?.high ?? null),
      priceY: toY(isFiniteNumber(priceToday) ? priceToday : null),
      markerPoints,
    };
  }, [npvRange, priceToday, normalizedMarkers]);

  const hasNpv = npvRange !== null && points.npvLowY !== null && points.npvHighY !== null;
  const hasTp = points.markerPoints.some((marker) => marker.lowY !== null && marker.highY !== null);
  const hasPrice = isFiniteNumber(priceToday) && points.priceY !== null;
  const npvLabels = resolveLabelPair(points.npvHighY, points.npvLowY);

  const priceLabel = useMemo(() => {
    if (!hasPrice || points.priceY === null || priceToday === null || !Number.isFinite(priceToday)) return null;
    const yBase = clamp(points.priceY + 4, Y_TOP, Y_BOTTOM);
    const tooCloseToRange = npvLabels !== null && (Math.abs(yBase - npvLabels.high) < 10 || Math.abs(yBase - npvLabels.low) < 10);
    const y = tooCloseToRange ? clamp(points.priceY - 8, Y_TOP, Y_BOTTOM) : yBase;
    return {
      x: 90,
      y,
      text: formatPerShareValue(priceToday),
    };
  }, [hasPrice, npvLabels, points.priceY, priceToday]);

  return (
    <div>
      {!hasNpv && !hasTp ? (
        <p className="status empty" style={{ margin: 0 }}>Saknar intervall-data (NPV/TP)</p>
      ) : (
        <div className="project-value-snapshot-wrap">
          <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="img" aria-label="Snapshot med NPV- och TP-intervall per aktie" style={{ width: "100%", height: "100%" }}>
            <rect x={92} y={14} width={36} height={92} rx={10} fill="rgba(15, 23, 42, 0.05)" />
            <rect x={210} y={14} width={72} height={92} rx={10} fill="rgba(15, 23, 42, 0.05)" />
            <line x1={0} y1={110} x2={320} y2={110} stroke="rgba(15, 23, 42, 0.14)" strokeWidth={1} />

            <text x={12} y={26} fontSize={10} fill="#6b7280">Nu</text>
            <text x={218} y={26} fontSize={10} fill="#6b7280">Prod-start</text>

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

            {points.markerPoints.map((marker) => {
              if (marker.highY === null || marker.lowY === null || marker.high === null || marker.low === null) return null;
              const tpLabels = resolveLabelPair(marker.highY, marker.lowY);
              const label = marker.yearLabelUsed ? marker.yearLabelUsed.slice(0, 4) : `tp=${marker.tp}`;
              return (
                <g key={`tp-${marker.tp}`}>
                  <line x1={marker.x} y1={marker.highY} x2={marker.x} y2={marker.lowY} stroke="#64748b" strokeWidth={6} strokeLinecap="round" />
                  {tpLabels && (
                    <>
                      <text x={marker.x + 8} y={tpLabels.high + 4} fontSize={10} fill="#1f2937">{formatPerShareValue(marker.high)}</text>
                      <text x={marker.x + 8} y={tpLabels.low + 4} fontSize={10} fill="#1f2937">{formatPerShareValue(marker.low)}</text>
                    </>
                  )}
                  <text x={marker.x - 6} y={108} fontSize={9} fill="#6b7280">{label}</text>
                </g>
              );
            })}

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
