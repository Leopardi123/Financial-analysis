import { useMemo } from "react";
import { Chart } from "react-google-charts";

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
  currentYear?: number | null;
  tpYear?: number | null;
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
  const { mode = "corporate", priceToday, npvLow, npvHigh, tpLow, tpHigh, tpMarkers, chartFlows, currentYear, tpYear, currencyCode } = props;
  const isProjectMode = mode === "project";

  const projectChartModel = useMemo(() => {
    if (!isProjectMode) return null;
    const dcfSeriesRawAll = Array.isArray(chartFlows?.dcfProdstartPresentPerShareSeries) ? chartFlows.dcfProdstartPresentPerShareSeries : [];
    const navSeriesRawAll = Array.isArray(chartFlows?.navProdstartPerShareSeries) ? chartFlows.navProdstartPerShareSeries : [];
    const rawLen = Math.max(dcfSeriesRawAll.length, navSeriesRawAll.length);
    if (rawLen < 1) return null;

    const flowLen = Math.max(1, rawLen - 3);
    const dcfSeriesRaw = dcfSeriesRawAll.slice(0, flowLen);
    const navSeriesRaw = navSeriesRawAll.slice(0, flowLen);

    const yearNow = Number.isInteger(currentYear) ? (currentYear as number) : new Date().getFullYear();
    const yearTp = Number.isInteger(tpYear) ? (tpYear as number) : yearNow + 1;
    const tpOffset = Math.max(1, yearTp - yearNow);
    const totalLen = tpOffset + flowLen;

    const highTp = isFiniteNumber(tpHigh) ? tpHigh : (isFiniteNumber(dcfSeriesRaw[0]) ? dcfSeriesRaw[0] : null);
    const lowTp = isFiniteNumber(tpLow) ? tpLow : (isFiniteNumber(navSeriesRaw[0]) ? navSeriesRaw[0] : null);
    const lowToday = isFiniteNumber(npvLow) ? npvLow : null;

    const dcfFlowTpPresent0 = isFiniteNumber(dcfSeriesRaw[0]) ? dcfSeriesRaw[0] : null;
    const inferredRate = (() => {
      if (tpOffset <= 0 || highTp === null || dcfFlowTpPresent0 === null || dcfFlowTpPresent0 === 0 || highTp <= 0 || dcfFlowTpPresent0 <= 0) return null;
      const ratio = highTp / dcfFlowTpPresent0;
      if (!Number.isFinite(ratio) || ratio <= 0) return null;
      const r = ratio ** (1 / tpOffset) - 1;
      return Number.isFinite(r) && r > -1 ? r : null;
    })();

    const highByIndex: Array<number | null> = Array.from({ length: totalLen }, () => null);
    const lowByIndex: Array<number | null> = Array.from({ length: totalLen }, () => null);

    for (let idx = 0; idx < totalLen; idx += 1) {
      if (idx <= tpOffset) {
        if (highTp !== null) {
          if (inferredRate !== null) {
            highByIndex[idx] = highTp / ((1 + inferredRate) ** (tpOffset - idx));
          } else {
            const startValue = isFiniteNumber(npvHigh) ? npvHigh : highTp;
            const t = tpOffset === 0 ? 1 : idx / tpOffset;
            highByIndex[idx] = startValue + (highTp - startValue) * t;
          }
        }

        if (lowTp !== null) {
          if (lowToday !== null) {
            if (lowToday > 0 && lowTp > 0) {
              const g = (lowTp / lowToday) ** (1 / tpOffset) - 1;
              lowByIndex[idx] = lowToday * ((1 + g) ** idx);
            } else {
              const t = tpOffset === 0 ? 1 : idx / tpOffset;
              lowByIndex[idx] = lowToday + (lowTp - lowToday) * t;
            }
          } else {
            lowByIndex[idx] = lowTp;
          }
        }
      } else {
        const flowIndex = idx - tpOffset;
        const navAtIdx = isFiniteNumber(navSeriesRaw[flowIndex]) ? navSeriesRaw[flowIndex] : null;
        const dcfPresentAtIdx = isFiniteNumber(dcfSeriesRaw[flowIndex]) ? dcfSeriesRaw[flowIndex] : null;
        lowByIndex[idx] = navAtIdx;
        if (dcfPresentAtIdx !== null) {
          if (inferredRate !== null) {
            highByIndex[idx] = dcfPresentAtIdx * ((1 + inferredRate) ** idx);
          } else {
            highByIndex[idx] = dcfPresentAtIdx;
          }
        }
      }
    }

    if (lowTp !== null) lowByIndex[tpOffset] = lowTp;
    if (highTp !== null) highByIndex[tpOffset] = highTp;

    const rows: Array<Array<number | string | null>> = [];
    const domainValues: number[] = [];

    for (let idx = 0; idx < totalLen; idx += 1) {
      const low = lowByIndex[idx];
      const high = highByIndex[idx];
      const orderedLow = low !== null && high !== null ? Math.min(low, high) : low;
      const orderedHigh = low !== null && high !== null ? Math.max(low, high) : high;
      const band = orderedLow !== null && orderedHigh !== null ? orderedHigh - orderedLow : null;

      const nowMarketMarker = idx === 0 && isFiniteNumber(priceToday) ? priceToday : null;
      const nowLowMarker = idx === 0 ? orderedLow : null;
      const nowHighMarker = idx === 0 ? orderedHigh : null;
      const tpLowMarker = idx === tpOffset ? orderedLow : null;
      const tpHighMarker = idx === tpOffset ? orderedHigh : null;

      for (const value of [orderedLow, orderedHigh, nowMarketMarker, nowLowMarker, nowHighMarker, tpLowMarker, tpHighMarker]) {
        if (typeof value === 'number' && Number.isFinite(value)) domainValues.push(value);
      }

      rows.push([
        idx,
        orderedLow,
        band,
        orderedLow,
        orderedHigh,
        nowMarketMarker,
        nowMarketMarker !== null ? ` ${formatPerShareValue(nowMarketMarker)}` : null,
        nowMarketMarker !== null ? `Aktiepris (nu)\nÅr: ${yearNow}\nVärde: ${formatPerShareValue(nowMarketMarker)}` : null,
        nowLowMarker,
        nowLowMarker !== null ? ` ${formatPerShareValue(nowLowMarker)}` : null,
        nowLowMarker !== null ? `Låg (nu)\nÅr: ${yearNow}\nVärde: ${formatPerShareValue(nowLowMarker)}` : null,
        nowHighMarker,
        nowHighMarker !== null ? ` ${formatPerShareValue(nowHighMarker)}` : null,
        nowHighMarker !== null ? `Hög (nu)\nÅr: ${yearNow}\nVärde: ${formatPerShareValue(nowHighMarker)}` : null,
        tpLowMarker,
        tpLowMarker !== null ? ` ${formatPerShareValue(tpLowMarker)}` : null,
        tpLowMarker !== null ? `Låg (TP)\nÅr: ${yearTp}\nVärde: ${formatPerShareValue(tpLowMarker)}` : null,
        tpHighMarker,
        tpHighMarker !== null ? ` ${formatPerShareValue(tpHighMarker)}` : null,
        tpHighMarker !== null ? `Hög (TP)\nÅr: ${yearTp}\nVärde: ${formatPerShareValue(tpHighMarker)}` : null,
      ]);
    }

    if (domainValues.length < 1) return null;

    return {
      data: [
        [
          'Index',
          'LowBase',
          'Band',
          'LowLine',
          'HighLine',
          'NowMarket',
          { role: 'annotation', type: 'string' },
          { role: 'tooltip', type: 'string' },
          'NowLow',
          { role: 'annotation', type: 'string' },
          { role: 'tooltip', type: 'string' },
          'NowHigh',
          { role: 'annotation', type: 'string' },
          { role: 'tooltip', type: 'string' },
          'TpLow',
          { role: 'annotation', type: 'string' },
          { role: 'tooltip', type: 'string' },
          'TpHigh',
          { role: 'annotation', type: 'string' },
          { role: 'tooltip', type: 'string' },
        ],
        ...rows,
      ] as (string | number | null | { role: string; type?: string })[][],
      ticks: [
        { v: 0, f: String(yearNow) },
        { v: tpOffset, f: String(yearTp) },
      ],
      totalLen,
    };
  }, [chartFlows, currentYear, isProjectMode, npvHigh, npvLow, priceToday, tpHigh, tpLow, tpYear]);

  if (isProjectMode) {
    if (!projectChartModel) {
      return <p className="status empty" style={{ margin: 0 }}>Saknar intervall-data (NPV/TP)</p>;
    }
    return (
      <div className="spot-range-chart-guard" style={{ marginTop: 8 }}>
        <Chart
          chartType="ComboChart"
          width="100%"
          height="260px"
          data={projectChartModel.data}
          options={{
            backgroundColor: "#e0e9ce",
            legend: { position: "none" },
            isStacked: true,
            areaOpacity: 0.26,
            chartArea: { left: 64, right: 22, top: 16, bottom: 36, width: "100%", height: "75%" },
            hAxis: {
              textStyle: { color: "#1f2937", fontSize: 11 },
              gridlines: { color: "rgba(184,196,173,0.35)", count: 4 },
              baselineColor: "rgba(71, 85, 105, 0.45)",
              ticks: projectChartModel.ticks,
              viewWindow: { min: -1, max: projectChartModel.totalLen - 1 },
            },
            vAxis: {
              title: currencyCode ?? "",
              format: "short",
              textStyle: { color: "#1f2937", fontSize: 11 },
              titleTextStyle: { color: "#1f2937", italic: false },
              gridlines: { color: "rgba(184,196,173,0.35)", count: 5 },
              minorGridlines: { color: "rgba(219,228,207,0.32)", count: 1 },
              baselineColor: "rgba(71, 85, 105, 0.45)",
            },
            tooltip: { trigger: "focus" },
            interpolateNulls: false,
            annotations: {
              alwaysOutside: true,
              textStyle: { color: "#111827", fontSize: 10 },
              stem: { color: "transparent", length: 0 },
            },
            colors: ["transparent", "#A8C686", "rgba(71,85,105,0.55)", "rgba(31,41,55,0.55)", "#be123c", "#64748b", "#475569", "#111111", "#111111"],
            seriesType: "line",
            series: {
              0: { type: "area", lineWidth: 0, pointSize: 0, visibleInLegend: false, enableInteractivity: false },
              1: { type: "area", lineWidth: 0, pointSize: 0, visibleInLegend: false },
              2: { type: "line", lineWidth: 1, pointSize: 0, visibleInLegend: false },
              3: { type: "line", lineWidth: 1, pointSize: 0, visibleInLegend: false },
              4: { type: "scatter", pointShape: "circle", pointSize: 7, lineWidth: 0, visibleInLegend: false },
              5: { type: "scatter", pointShape: "circle", pointSize: 5, lineWidth: 0, visibleInLegend: false },
              6: { type: "scatter", pointShape: "circle", pointSize: 5, lineWidth: 0, visibleInLegend: false },
              7: { type: "scatter", pointShape: "circle", pointSize: 7, lineWidth: 0, visibleInLegend: false },
              8: { type: "scatter", pointShape: "circle", pointSize: 7, lineWidth: 0, visibleInLegend: false },
            },
          }}
        />
      </div>
    );
  }

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

            <text x={12} y={26} fontSize={10} fill="#6b7280">Nu</text>
            <text x={RIGHT_BLOCK_X + 8} y={26} fontSize={10} fill="#6b7280">Prod-start</text>

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

            {validMarkers.map((marker) => {
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

            {hasPrice && (
              <>
                <circle cx={X_LEFT} cy={points.priceY!} r={4} fill="#dc2626" stroke="#ffffff" strokeWidth={1.25} />
                <text x={90} y={clamp(points.priceY! + 4, Y_TOP, Y_BOTTOM)} fontSize={11} fill="#dc2626" textAnchor="end">{formatPerShareValue(priceToday as number)}</text>
              </>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
