import { useMemo } from "react";

type TpMarker = {
  tp: number;
  high: number | null;
  low: number | null;
  yearLabelUsed?: string | null;
};

type ValueRangeSnapshotCardProps = {
  mode?: "corporate" | "project";
  priceToday?: number | null;
  npvLow?: number | null;
  npvHigh?: number | null;
  tpLow?: number | null;
  tpHigh?: number | null;
  tpMarkers?: TpMarker[];
  chartFlows?: {
    dcfProdstartPresentPerShareSeries?: Array<number | null>;
    navProdstartPerShareSeries?: Array<number | null>;
  } | null;
  currencyCode?: string;
};

const Y_TOP = 20;
const Y_BOTTOM = 100;
const VIEWBOX_WIDTH = 320;
const VIEWBOX_HEIGHT = 120;
const X_LEFT = 110;
const MIN_LABEL_SPACING = 12;
const RIGHT_BLOCK_X = 210;
const RIGHT_BLOCK_WIDTH = 72;

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
      if (high === null && low === null) return { ...marker, high: null, low: null };
      if (high === null) return { ...marker, high: low, low };
      if (low === null) return { ...marker, high, low: high };
      return { ...marker, high: Math.max(high, low), low: Math.min(high, low) };
    })
    .sort((a, b) => a.tp - b.tp);

  if (normalized.length > 0) return normalized;
  if (!fallback) return [];
  return [{ tp: 1, high: fallback.high, low: fallback.low }];
}

export default function ValueRangeSnapshotCard(props: ValueRangeSnapshotCardProps) {
  const { mode = "corporate", priceToday, npvLow, npvHigh, tpLow, tpHigh, tpMarkers, chartFlows } = props;

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

  const normalizedMarkers = useMemo(() => normalizeTpMarkers(tpMarkers, tpRange), [tpMarkers, tpRange]);

  const points = useMemo(() => {
    const tpMarkerValues = normalizedMarkers.flatMap((marker) => [marker.low, marker.high]);
    const domain = [priceToday, npvRange?.low, npvRange?.high, ...tpMarkerValues].filter(isFiniteNumber);
    const min = domain.length > 0 ? Math.min(...domain) : null;
    const max = domain.length > 0 ? Math.max(...domain) : null;

    const toY = (value: number | null): number | null => {
      if (value === null || min === null || max === null) return null;
      if (max === min) return 60;
      const t = (value - min) / (max - min);
      return clamp(Y_BOTTOM + (Y_TOP - Y_BOTTOM) * t, Y_TOP, Y_BOTTOM);
    };

    const lastTp = normalizedMarkers.length > 0 ? normalizedMarkers[normalizedMarkers.length - 1].tp : null;
    const firstTp = normalizedMarkers.length > 0 ? normalizedMarkers[0].tp : null;

    const markerPoints = normalizedMarkers.map((marker, idx) => {
      let x = RIGHT_BLOCK_X + RIGHT_BLOCK_WIDTH / 2;
      if (lastTp !== null && firstTp !== null && lastTp > firstTp) {
        const ratio = (marker.tp - firstTp) / (lastTp - firstTp);
        x = clamp(RIGHT_BLOCK_X + 10 + ratio * (RIGHT_BLOCK_WIDTH - 20), RIGHT_BLOCK_X + 10, RIGHT_BLOCK_X + RIGHT_BLOCK_WIDTH - 10);
      } else if (normalizedMarkers.length > 1) {
        const step = (RIGHT_BLOCK_WIDTH - 20) / (normalizedMarkers.length - 1);
        x = RIGHT_BLOCK_X + 10 + idx * step;
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
  const validMarkers = points.markerPoints.filter((marker) => marker.lowY !== null && marker.highY !== null && marker.low !== null && marker.high !== null);
  const hasTp = validMarkers.length > 0;
  const hasPrice = isFiniteNumber(priceToday) && points.priceY !== null;
  const npvLabels = resolveLabelPair(points.npvHighY, points.npvLowY);
  const isProjectMode = mode === "project";

  const flowPoints = useMemo(() => {
    const dcfSeriesRaw = Array.isArray(chartFlows?.dcfProdstartPresentPerShareSeries) ? chartFlows?.dcfProdstartPresentPerShareSeries : [];
    const navSeriesRaw = Array.isArray(chartFlows?.navProdstartPerShareSeries) ? chartFlows?.navProdstartPerShareSeries : [];
    const len = Math.max(dcfSeriesRaw.length, navSeriesRaw.length);
    if (!isProjectMode || len < 1) return [] as Array<{ x: number; dcf: number | null; nav: number | null; dcfY: number | null; navY: number | null }>;
    const dcfSeries = Array.from({ length: len }, (_, idx) => (isFiniteNumber(dcfSeriesRaw[idx]) ? (dcfSeriesRaw[idx] as number) : null));
    const navSeries = Array.from({ length: len }, (_, idx) => (isFiniteNumber(navSeriesRaw[idx]) ? (navSeriesRaw[idx] as number) : null));
    const domain = [priceToday, ...dcfSeries, ...navSeries, tpLow, tpHigh, npvLow, npvHigh].filter(isFiniteNumber);
    const min = domain.length > 0 ? Math.min(...domain) : null;
    const max = domain.length > 0 ? Math.max(...domain) : null;
    const toY = (value: number | null): number | null => {
      if (value === null || min === null || max === null) return null;
      if (max === min) return 60;
      const t = (value - min) / (max - min);
      return clamp(Y_BOTTOM + (Y_TOP - Y_BOTTOM) * t, Y_TOP, Y_BOTTOM);
    };
    const xStart = X_LEFT;
    const xEnd = RIGHT_BLOCK_X + RIGHT_BLOCK_WIDTH - 12;
    return Array.from({ length: len }, (_, idx) => {
      const x = len === 1 ? xStart : xStart + ((xEnd - xStart) * idx) / (len - 1);
      const dcf = dcfSeries[idx] ?? null;
      const nav = navSeries[idx] ?? null;
      return { x, dcf, nav, dcfY: toY(dcf), navY: toY(nav) };
    });
  }, [chartFlows, isProjectMode, npvHigh, npvLow, priceToday, tpHigh, tpLow]);

  const flowHasSeries = flowPoints.some((point) => point.dcfY !== null || point.navY !== null);
  const flowStart = flowPoints[0] ?? null;
  const flowTpLabels = flowStart ? resolveLabelPair(flowStart.dcfY, flowStart.navY) : null;
  const flowDcfPolyline = flowPoints.filter((point) => point.dcfY !== null).map((point) => `${point.x},${point.dcfY}`).join(" ");
  const flowNavPolyline = flowPoints.filter((point) => point.navY !== null).map((point) => `${point.x},${point.navY}`).join(" ");

  return (
    <div>
      {!hasNpv && !hasTp ? (
        <p className="status empty" style={{ margin: 0 }}>Saknar intervall-data (NPV/TP)</p>
      ) : (
        <div className="project-value-snapshot-wrap">
          <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="img" aria-label="Snapshot med NPV- och TP-intervall per aktie" style={{ width: "100%", height: "100%" }}>
            <rect x={92} y={14} width={36} height={92} rx={10} fill="rgba(15, 23, 42, 0.05)" />
            <rect x={RIGHT_BLOCK_X} y={14} width={RIGHT_BLOCK_WIDTH} height={92} rx={10} fill="rgba(15, 23, 42, 0.05)" />
            <line x1={0} y1={110} x2={320} y2={110} stroke="rgba(15, 23, 42, 0.14)" strokeWidth={1} />

            {!isProjectMode && (
              <>
                <text x={12} y={26} fontSize={10} fill="#6b7280">Nu</text>
                <text x={RIGHT_BLOCK_X + 8} y={26} fontSize={10} fill="#6b7280">Prod-start</text>
              </>
            )}

            {hasNpv ? (
              <>
                <line x1={X_LEFT} y1={points.npvHighY!} x2={X_LEFT} y2={points.npvLowY!} stroke="#64748b" strokeWidth={8} strokeLinecap="round" />
                {npvLabels && (
                  <>
                    <text x={82} y={npvLabels.high + 4} fontSize={11} fill="#1f2937" textAnchor="end">{formatPerShareValue(npvRange!.high)}</text>
                    <text x={82} y={npvLabels.low + 4} fontSize={11} fill="#1f2937" textAnchor="end">{formatPerShareValue(npvRange!.low)}</text>
                  </>
                )}
              </>
            ) : (
              <text x={82} y={64} fontSize={11} fill="#6b7280" textAnchor="end">n/a</text>
            )}

            {hasNpv && hasTp && (
              <polygon
                points={`${X_LEFT},${points.npvHighY} ${validMarkers.map((m) => `${m.x},${m.highY!}`).join(" ")} ${[...validMarkers].reverse().map((m) => `${m.x},${m.lowY!}`).join(" ")} ${X_LEFT},${points.npvLowY}`}
                fill="rgba(100, 116, 139, 0.12)"
                stroke="none"
              />
            )}

            {hasNpv && hasTp && (
              <>
                <polyline
                  points={`${X_LEFT},${points.npvHighY} ${validMarkers.map((m) => `${m.x},${m.highY!}`).join(" ")}`}
                  fill="none"
                  stroke="rgba(100, 116, 139, 0.55)"
                  strokeWidth={1.5}
                />
                <polyline
                  points={`${X_LEFT},${points.npvLowY} ${validMarkers.map((m) => `${m.x},${m.lowY!}`).join(" ")}`}
                  fill="none"
                  stroke="rgba(100, 116, 139, 0.55)"
                  strokeWidth={1.5}
                />
              </>
            )}

            {!isProjectMode && validMarkers.map((marker) => {
              const tpLabels = resolveLabelPair(marker.highY!, marker.lowY!);
              const label = marker.yearLabelUsed ? marker.yearLabelUsed.slice(0, 4) : `tp=${marker.tp}`;
              return (
                <g key={`tp-${marker.tp}`}>
                  <line x1={marker.x} y1={marker.highY!} x2={marker.x} y2={marker.lowY!} stroke="rgba(100, 116, 139, 0.45)" strokeWidth={2} />
                  <circle cx={marker.x} cy={marker.highY!} r={2.8} fill="#475569" />
                  <circle cx={marker.x} cy={marker.lowY!} r={2.8} fill="#475569" />
                  {tpLabels && (
                    <>
                      <text x={marker.x + 6} y={tpLabels.high + 4} fontSize={10} fill="#1f2937">{formatPerShareValue(marker.high!)}</text>
                      <text x={marker.x + 6} y={tpLabels.low + 4} fontSize={10} fill="#1f2937">{formatPerShareValue(marker.low!)}</text>
                    </>
                  )}
                  <text x={marker.x - 6} y={108} fontSize={9} fill="#6b7280">{label}</text>
                </g>
              );
            })}

            {isProjectMode && flowHasSeries && (
              <>
                {flowNavPolyline.length > 0 && (
                  <polyline points={flowNavPolyline} fill="none" stroke="rgba(100, 116, 139, 0.7)" strokeWidth={2} />
                )}
                {flowDcfPolyline.length > 0 && (
                  <polyline points={flowDcfPolyline} fill="none" stroke="#1f2937" strokeWidth={2} />
                )}
                {flowStart?.dcfY !== null && (
                  <circle cx={flowStart.x} cy={flowStart.dcfY} r={3.5} fill="#111111" />
                )}
                {flowStart?.navY !== null && (
                  <circle cx={flowStart.x} cy={flowStart.navY} r={3.5} fill="#111111" />
                )}
                {flowTpLabels && flowStart && (
                  <>
                    <text x={flowStart.x + 8} y={flowTpLabels.high + 4} fontSize={10} fill="#1f2937">{formatPerShareValue(flowStart.dcf as number)}</text>
                    <text x={flowStart.x + 8} y={flowTpLabels.low + 4} fontSize={10} fill="#1f2937">{formatPerShareValue(flowStart.nav as number)}</text>
                  </>
                )}
              </>
            )}

            {hasPrice && (
              <>
                <circle cx={X_LEFT} cy={points.priceY!} r={3.5} fill="#be123c" />
                <text x={90} y={clamp(points.priceY! + 4, Y_TOP, Y_BOTTOM)} fontSize={11} fill="#be123c" textAnchor="end">{formatPerShareValue(priceToday as number)}</text>
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
