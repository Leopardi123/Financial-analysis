import { useMemo } from "react";
import { buildCorporateChartRows, buildCorporateYearTicks, clipCorporateChartInput, valueRangeChartHeader, type CorporateChartInput } from "./corporateChartRows";
import ValueRangeChart from "./ValueRangeChart";
import { buildValueRangeChartRow, findFirstHighPeak } from "./valueRangeCurve";

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
    dcfProdstartExCapexPerShareSeries?: Array<number | null>;
    navByPeriodPerShareSeries?: Array<number | null>;
    yearsByPeriod?: Array<number | null>;
    productionStartPeriod?: number | null;
    discountRate?: number | null;
  } | null;
  currentYear?: number | null;
  tpYear?: number | null;
  currencyCode?: string;
  discountRate?: number | null;
  /** Canonical denominator used by the List 2 table after cash-first financing. */
  canonicalSharesPostFinancing?: number | null;
  corporateTimeSeries?: {
    valuationYear?: number;
    rows: Array<{ period: number; year: number; npvPerShare: number | null; dcfPerShare: number | null; dcfExCapexPerShare?: number | null; navPerShare: number | null; sharesPf: number | null }>;
    projectMarkers: Array<{ projectId: string; projectName: string; productionStartYear: number | null; navPerShare?: number | null; dcfPerShare?: number | null }>;
  } | null;
  canonicalTimeline?: {
    productionStartPeriod: number | null;
    periods: Array<{ periodIndex: number; calendarYear: number; dcfPerShareTarget: number | null; navPerShareTarget: number | null }>;
  } | null;
  projectDebug?: {
    yearsByPeriod?: Array<number | null> | null;
    fcffProductionTableSeries?: Array<number | null> | null;
    fcffNpvSeries?: Array<number | null> | null;
    discountRate?: number | null;
    tpPeriod?: number | null;
    debugEnabled?: boolean;
    fxUsdToTarget?: number | null;
    sharesPostFinancing?: number | null;
    netCashTarget?: number | null;
    capexSeries?: Array<number | null> | null;
  } | null;
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

function computeViewWindow(domainValues: number[]): { min: number; max: number } | null {
  if (domainValues.length < 1) return null;
  const min = Math.min(...domainValues);
  const max = Math.max(...domainValues);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (max === min) {
    const pad = Math.max(Math.abs(max) * 0.08, 0.5);
    return { min: min - pad, max: max + pad };
  }
  const span = max - min;
  return {
    min: min - span * 0.12,
    max: max + span * 0.12,
  };
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
      return { ...marker, high, low };
    })
    .sort((a, b) => a.tp - b.tp);

  if (normalized.length > 0) return normalized;
  if (!fallback) return [];
  return [{ tp: 1, high: fallback.high, low: fallback.low }];
}


function isProjectChartDataTypeSafe(data: Array<Array<string | number | null | { role: string; type?: string }>>): boolean {
  if (!Array.isArray(data) || data.length < 2) return false;
  for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
    const row = data[rowIndex];
    if (!Array.isArray(row) || row.length !== valueRangeChartHeader.length) return false;
    for (let col = 0; col < row.length; col += 1) {
      const value = row[col];
      const header = valueRangeChartHeader[col];
      if (typeof header === 'object' && 'role' in header) {
        if (value !== null && typeof value !== 'string') {
          return false;
        }
      } else if (value !== null && !(typeof value === 'number' && Number.isFinite(value))) {
        return false;
      }
    }
  }
  return true;
}


export default function ValueRangeSnapshotCard(props: ValueRangeSnapshotCardProps) {
  const { mode = "corporate", priceToday, npvLow, npvHigh, tpLow, tpHigh, tpMarkers, currencyCode, discountRate: discountRateProp, projectDebug, corporateTimeSeries, canonicalTimeline } = props;
  const isProjectMode = mode === "project";

  const projectChartModel = useMemo(() => {
    if (!isProjectMode || !canonicalTimeline?.periods.length) return null;
    const periods = canonicalTimeline.periods;
    const domainValues = periods
      .flatMap((period) => [period.dcfPerShareTarget, period.navPerShareTarget])
      .filter((value): value is number => isFiniteNumber(value));
    if (isFiniteNumber(priceToday)) domainValues.push(priceToday);
    const valueWindow = computeViewWindow(domainValues);
    if (!valueWindow) return null;
    const tpOffset = canonicalTimeline.productionStartPeriod ?? -1;
    const rows = periods.map((period) => buildValueRangeChartRow({
      year: period.calendarYear,
      low: period.navPerShareTarget,
      high: period.dcfPerShareTarget,
      currentPrice: period.periodIndex === 0 && isFiniteNumber(priceToday) ? priceToday : null,
      annotateCurrent: period.periodIndex === 0,
      annotateProductionStart: period.periodIndex === tpOffset,
      format: formatPerShareValue,
    }));
    const data = [[...valueRangeChartHeader], ...rows] as (string | number | null | { role: string; type?: string })[][];
    if (!isProjectChartDataTypeSafe(data)) return null;
    const debugRows = periods.map((period) => ({
      periodIndex: period.periodIndex,
      calendarYear: period.calendarYear,
      undiscountedHigh: period.dcfPerShareTarget,
      undiscountedLow: period.navPerShareTarget,
      discountedHigh: null,
      discountedLow: null,
      discountFactorHigh: null,
      discountFactorLow: null,
      highBeforeFix: null,
      highExponentBefore: null,
      highExponentAfter: null,
    }));
    return {
      yearNow: periods[0].calendarYear,
      data,
      ticks: periods.filter((period) => period.periodIndex === 0 || period.periodIndex === tpOffset)
        .map((period) => ({ v: period.calendarYear, f: String(period.calendarYear) })),
      peakYear: periods[0].calendarYear,
      valueWindow,
      discountRate: null,
      tpOffset,
      debugRows,
      rawFlowSeries: {
        dcfSeriesRawAll: periods.map((period) => period.dcfPerShareTarget),
        navSeriesRawAll: periods.map((period) => period.navPerShareTarget),
        dcfSeriesRaw: periods.map((period) => period.dcfPerShareTarget),
        navSeriesRaw: periods.map((period) => period.navPerShareTarget),
      },
    };
  }, [canonicalTimeline, isProjectMode, priceToday]);



  const corporateChartModel = useMemo(() => {
    if (!corporateTimeSeries?.rows?.length) return null;
    if (!isFiniteNumber(discountRateProp) || discountRateProp <= 0) return null;
    const chartWindow = clipCorporateChartInput(corporateTimeSeries as CorporateChartInput);
    const today = { low: isFiniteNumber(npvLow) ? npvLow : null, high: isFiniteNumber(npvHigh) ? npvHigh : null, price: isFiniteNumber(priceToday) ? priceToday : null, tpLow: isFiniteNumber(tpLow) ? tpLow : null, tpHigh: isFiniteNumber(tpHigh) ? tpHigh : null };
    const fullRows = buildCorporateChartRows(chartWindow.input, today, discountRateProp, currencyCode);
    const peak = findFirstHighPeak(fullRows.map((row) => ({ year: row[0] as number, low: row[1] as number | null, high: row[4] as number | null })));
    const baselineEnd = chartWindow.effectiveChartEndYear ?? chartWindow.lastAvailableCorporateYear;
    const effectiveEnd = peak && baselineEnd !== null ? Math.max(baselineEnd, peak.year) : baselineEnd;
    const renderedInput = effectiveEnd === null ? chartWindow.input : { ...chartWindow.input, rows: chartWindow.input.rows.filter((row) => row.year <= effectiveEnd) };
    const rows = buildCorporateChartRows(renderedInput, today, discountRateProp, currencyCode);
    const domainValues = rows.flatMap((row) => [row[1], row[4], row[5]]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const valueWindow = computeViewWindow(domainValues);
    if (!valueWindow) return null;
    const years = renderedInput.rows.map((row) => row.year);
    const ticks = buildCorporateYearTicks(renderedInput, peak?.year);
    return { data: [[...valueRangeChartHeader], ...rows], ticks, valueWindow, peakYear: peak?.year ?? years[0], yearMin: years[0] - 1, yearMax: effectiveEnd ?? years[years.length - 1] };
  }, [corporateTimeSeries, currencyCode, discountRateProp, npvHigh, npvLow, priceToday, tpHigh, tpLow]);

  if (!isProjectMode && corporateChartModel) {
    return <div className="spot-range-chart-guard" style={{ marginTop: 8 }}><ValueRangeChart {...corporateChartModel} currencyCode={currencyCode} /></div>;
  }

  if (isProjectMode) {
    if (!projectChartModel) {
      return <p className="status empty" style={{ margin: 0 }}>Saknar intervall-data (NPV/TP)</p>;
    }
    return (
      <div className="spot-range-chart-guard" style={{ marginTop: 8 }}>
        <ValueRangeChart
          data={projectChartModel.data}
          ticks={projectChartModel.ticks}
          yearMin={projectChartModel.yearNow - 1}
          yearMax={projectChartModel.yearNow + Math.max(1, projectChartModel.data.length - 2)}
          peakYear={projectChartModel.peakYear}
          valueWindow={projectChartModel.valueWindow}
          currencyCode={currencyCode}
        />
        {projectDebug?.debugEnabled && (
          <details style={{ marginTop: 8 }}>
            <summary>Canonical valuation timeline</summary>
            <div style={{ overflowX: "auto" }}><table><thead><tr><th>period</th><th>year</th><th>DCF/share (High)</th><th>NAV/share (Low)</th></tr></thead><tbody>
              {canonicalTimeline?.periods.map((period) => <tr key={period.periodIndex}><td>{period.periodIndex}</td><td>{period.calendarYear}</td><td>{period.dcfPerShareTarget ?? "null"}</td><td>{period.navPerShareTarget ?? "null"}</td></tr>)}
            </tbody></table></div>
          </details>
        )}
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
