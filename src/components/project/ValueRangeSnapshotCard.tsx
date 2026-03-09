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
  projectDebug?: {
    yearsByPeriod?: Array<number | null> | null;
    fcffProductionTableSeries?: Array<number | null> | null;
    fcffNpvSeries?: Array<number | null> | null;
    discountRate?: number | null;
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
      return { ...marker, high: Math.max(high, low), low: Math.min(high, low) };
    })
    .sort((a, b) => a.tp - b.tp);

  if (normalized.length > 0) return normalized;
  if (!fallback) return [];
  return [{ tp: 1, high: fallback.high, low: fallback.low }];
}


function isProjectChartDataTypeSafe(data: Array<Array<string | number | null | { role: string; type?: string }>>): boolean {
  if (!Array.isArray(data) || data.length < 2) return false;
  const numericColumns = new Set([0, 1, 2, 3, 4, 5, 7, 9, 11, 13]);
  for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
    const row = data[rowIndex];
    if (!Array.isArray(row)) return false;
    for (let col = 0; col < row.length; col += 1) {
      const value = row[col];
      if (numericColumns.has(col)) {
        if (value !== null && !(typeof value === 'number' && Number.isFinite(value))) {
          return false;
        }
      } else {
        if (value !== null && typeof value !== 'string') {
          return false;
        }
      }
    }
  }
  return true;
}

export default function ValueRangeSnapshotCard(props: ValueRangeSnapshotCardProps) {
  const { mode = "corporate", priceToday, npvLow, npvHigh, tpLow, tpHigh, tpMarkers, chartFlows, currentYear, tpYear, currencyCode, projectDebug } = props;
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

    const yearNow = new Date().getUTCFullYear();
    const rawTpYear = Number.isInteger(tpYear) ? (tpYear as number) : (Number.isInteger(currentYear) ? (currentYear as number) + 1 : yearNow + 1);
    const yearTp = Math.max(yearNow + 1, rawTpYear);
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
            const start = isFiniteNumber(npvHigh) ? npvHigh : highTp;
            const t = tpOffset === 0 ? 1 : idx / tpOffset;
            highByIndex[idx] = start + (highTp - start) * t;
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
    const currentLowCandidate = lowByIndex[0];
    const currentHighCandidate = highByIndex[0];
    const markerDomain = [currentLowCandidate, currentHighCandidate, priceToday].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const markerSpan = markerDomain.length > 1 ? Math.max(...markerDomain) - Math.min(...markerDomain) : 0;
    const markerMinSep = Math.max(0.12, markerSpan * 0.08);
    const suppressCurrentPriceLabel = isFiniteNumber(priceToday)
      && ((typeof currentLowCandidate === "number" && Math.abs((priceToday as number) - currentLowCandidate) < markerMinSep)
        || (typeof currentHighCandidate === "number" && Math.abs((priceToday as number) - currentHighCandidate) < markerMinSep));

    for (let idx = 0; idx < totalLen; idx += 1) {
      const low = lowByIndex[idx];
      const high = highByIndex[idx];
      const orderedLow = low !== null && high !== null ? Math.min(low, high) : low;
      const orderedHigh = low !== null && high !== null ? Math.max(low, high) : high;
      const band = orderedLow !== null && orderedHigh !== null ? orderedHigh - orderedLow : null;
      const currentMarker = idx === 0 && isFiniteNumber(priceToday) ? priceToday : null;
      const tpLowMarker = idx === tpOffset && lowTp !== null ? lowTp : null;
      const tpHighMarker = idx === tpOffset && highTp !== null ? highTp : null;

      for (const value of [orderedLow, orderedHigh, currentMarker, tpLowMarker, tpHighMarker]) {
        if (typeof value === 'number' && Number.isFinite(value)) domainValues.push(value);
      }

      const currentLowMarker = idx === 0 ? orderedLow : null;
      const currentHighMarker = idx === 0 ? orderedHigh : null;

      rows.push([
        yearNow + idx,
        orderedLow,
        band,
        orderedLow,
        orderedHigh,
        currentMarker,
        currentMarker !== null && !suppressCurrentPriceLabel ? `      ${formatPerShareValue(currentMarker)}` : null,
        currentLowMarker,
        currentLowMarker !== null ? `      ${formatPerShareValue(currentLowMarker)}` : null,
        currentHighMarker,
        currentHighMarker !== null ? `      ${formatPerShareValue(currentHighMarker)}` : null,
        tpLowMarker,
        tpLowMarker !== null ? `      ${formatPerShareValue(tpLowMarker)}` : null,
        tpHighMarker,
        tpHighMarker !== null ? `      ${formatPerShareValue(tpHighMarker)}` : null,
      ]);
    }

    if (domainValues.length < 1) return null;
    const valueWindow = computeViewWindow(domainValues);
    if (!valueWindow) return null;
    const data = [
        [
          'Index',
          'Low',
          'Band',
          'Low boundary',
          'High boundary',
          'Current',
          { role: 'annotation', type: 'string' },
          'Current Low',
          { role: 'annotation', type: 'string' },
          'Current High',
          { role: 'annotation', type: 'string' },
          'TP Low',
          { role: 'annotation', type: 'string' },
          'TP High',
          { role: 'annotation', type: 'string' },
        ],
        ...rows,
      ] as (string | number | null | { role: string; type?: string })[][];

    if (!isProjectChartDataTypeSafe(data)) return null;

    const debugRows = rows.map((row, idx) => {
      const discountFactorHigh = inferredRate !== null
        ? (idx <= tpOffset ? (1 + inferredRate) ** (tpOffset - idx) : 1 / ((1 + inferredRate) ** idx))
        : null;
      const discountFactorLow = idx > tpOffset
        ? null
        : (lowToday !== null && lowTp !== null && lowToday > 0 && lowTp > 0
          ? 1 / (((lowTp / lowToday) ** (1 / tpOffset)) ** idx)
          : null);
      const discountedHigh = inferredRate !== null && highByIndex[idx] !== null
        ? (idx <= tpOffset ? highByIndex[idx] : highByIndex[idx] / ((1 + inferredRate) ** idx))
        : null;
      const discountedLow = discountFactorLow !== null && lowByIndex[idx] !== null
        ? lowByIndex[idx] * discountFactorLow
        : null;
      return {
        periodIndex: idx,
        calendarYear: row[0],
        undiscountedHigh: highByIndex[idx],
        undiscountedLow: lowByIndex[idx],
        discountFactorHigh,
        discountFactorLow,
        discountedHigh,
        discountedLow,
      };
    });

    return {
      yearNow,
      data,
      ticks: [
        { v: yearNow - 1, f: "" },
        { v: yearNow, f: String(yearNow) },
        { v: yearTp, f: String(yearTp) },
      ],
      valueWindow,
      inferredRate,
      tpOffset,
      debugRows,
      rawFlowSeries: {
        dcfSeriesRawAll,
        navSeriesRawAll,
        dcfSeriesRaw,
        navSeriesRaw,
      },
    };
  }, [chartFlows, currentYear, isProjectMode, npvHigh, npvLow, priceToday, tpHigh, tpLow, tpYear]);

  const projectCurveDiagnosis = useMemo(() => {
    if (!projectChartModel) return null;
    const firstHighDrop = projectChartModel.debugRows.find((row, idx) => idx > 0 && row.discountedHigh !== null && projectChartModel.debugRows[idx - 1].discountedHigh !== null && (row.discountedHigh as number) < (projectChartModel.debugRows[idx - 1].discountedHigh as number)) ?? null;
    const firstLowDrop = projectChartModel.debugRows.find((row, idx) => idx > 0 && row.discountedLow !== null && projectChartModel.debugRows[idx - 1].discountedLow !== null && (row.discountedLow as number) < (projectChartModel.debugRows[idx - 1].discountedLow as number)) ?? null;
    return { firstHighDrop, firstLowDrop };
  }, [projectChartModel]);

  const fcffComparison = useMemo(() => {
    if (!projectDebug) return null;
    const prod = Array.isArray(projectDebug.fcffProductionTableSeries) ? projectDebug.fcffProductionTableSeries : [];
    const npv = Array.isArray(projectDebug.fcffNpvSeries) ? projectDebug.fcffNpvSeries : [];
    const len = Math.max(prod.length, npv.length);
    const rows = Array.from({ length: len }, (_, t) => {
      const p = prod[t] ?? null;
      const n = npv[t] ?? null;
      const diff = p !== null && n !== null ? p - n : null;
      return { periodIndex: t, fcffProductionTable: p, fcffNpv: n, diff };
    });
    const firstDiff = rows.find((row) => row.diff !== null && row.diff !== 0) ?? null;
    return { rows, match: firstDiff === null, firstDiff };
  }, [projectDebug]);

  if (isProjectMode) {
    if (!projectChartModel) {
      return <p className="status empty" style={{ margin: 0 }}>Saknar intervall-data (NPV/TP)</p>;
    }
    return (
      <div className="spot-range-chart-guard" style={{ marginTop: 8 }}>
        <Chart
          chartType="ComboChart"
          width="100%"
          height="220px"
          data={projectChartModel.data}
          options={{
            backgroundColor: "#e0e9ce",
            legend: { position: "none" },
            isStacked: true,
            areaOpacity: 0.32,
            chartArea: { left: 64, right: 56, top: 14, bottom: 30, width: "100%", height: "68%" },
            hAxis: {
              textStyle: { color: "#1f2937", fontSize: 11 },
              gridlines: { color: "transparent", count: 0 },
              baselineColor: "transparent",
              viewWindowMode: "explicit",
              viewWindow: { min: projectChartModel.yearNow - 1, max: projectChartModel.yearNow + Math.max(1, (projectChartModel.data.length - 2) as number) },
              ticks: projectChartModel.ticks,
            },
            vAxis: {
              title: currencyCode ?? "",
              textPosition: "none",
              titleTextStyle: { color: "#1f2937", italic: false },
              gridlines: { color: "transparent", count: 0 },
              minorGridlines: { color: "transparent", count: 0 },
              baselineColor: "transparent",
              viewWindowMode: "explicit",
              viewWindow: projectChartModel.valueWindow,
            },
            tooltip: { trigger: "none" },
            interpolateNulls: false,
            annotations: {
              alwaysOutside: true,
              textStyle: { color: "#111827", fontSize: 9 },
              stem: { color: "transparent", length: 10 },
            },
            colors: ["transparent", "#A8C686", "#2C3E50", "#2C3E50", "#be123c", "#111111", "#111111", "#111111", "#111111"],
            seriesType: "line",
            series: {
              0: { type: "area", lineWidth: 0, pointSize: 0, visibleInLegend: false, enableInteractivity: false },
              1: { type: "area", lineWidth: 0, pointSize: 0, visibleInLegend: false },
              2: { type: "line", lineWidth: 0.62, pointSize: 0, visibleInLegend: false },
              3: { type: "line", lineWidth: 0.62, pointSize: 0, visibleInLegend: false },
              4: { type: "scatter", pointShape: "circle", pointSize: 7, lineWidth: 0, visibleInLegend: false },
              5: { type: "scatter", pointShape: "circle", pointSize: 7, lineWidth: 0, visibleInLegend: false },
              6: { type: "scatter", pointShape: "circle", pointSize: 7, lineWidth: 0, visibleInLegend: false },
              7: { type: "scatter", pointShape: "circle", pointSize: 7, lineWidth: 0, visibleInLegend: false },
              8: { type: "scatter", pointShape: "circle", pointSize: 7, lineWidth: 0, visibleInLegend: false },
            },
          }}
        />
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>debugg fallande graf</summary>
          <div style={{ marginTop: 8, fontSize: 12, color: "#1f2937", display: "grid", gap: 12 }}>
            <div><strong>1. Sammanfattning</strong><div>FCFF-serier matchar: {fcffComparison?.match ? "JA" : "NEJ"}</div></div>
            <div><strong>2. Var räknas serierna ut</strong><div>High/Low-graf: <code>src/components/project/ValueRangeSnapshotCard.tsx :: projectChartModel(useMemo)</code>, input: <code>project.chartFlows.dcfProdstartPresentPerShareSeries/navProdstartPerShareSeries</code>.</div><div>Produktionstabell FCFF: <code>snapshot.series.fcffUSD</code> (från motorn).</div><div>NPV FCFF: <code>getProjectInputs().series.fcfUSD</code> prioriterar <code>snapshot.series.fcffUSD</code>.</div></div>
            <div><strong>3. Hur räknas serierna ut</strong><div>High före/vid tp: <code>highTp / (1 + inferredRate)^(tpOffset - idx)</code>. High efter tp: <code>dcfPresentAtIdx * (1 + inferredRate)^idx</code>. Low: linjär/growth till tp, därefter <code>navSeriesRaw[flowIndex]</code>. Diskonteringsränta: {projectDebug?.discountRate ?? null}.</div></div>
            <div style={{ overflowX: "auto" }}><strong>4. Diskonterad serie high/low</strong>
              <table><thead><tr><th>t</th><th>år</th><th>odisk high</th><th>odisk low</th><th>df high</th><th>df low</th><th>disk high</th><th>disk low</th></tr></thead><tbody>{projectChartModel.debugRows.map((row) => <tr key={`disc-${row.periodIndex}`}><td>{row.periodIndex}</td><td>{row.calendarYear}</td><td>{row.undiscountedHigh ?? "null"}</td><td>{row.undiscountedLow ?? "null"}</td><td>{row.discountFactorHigh ?? "null"}</td><td>{row.discountFactorLow ?? "null"}</td><td>{row.discountedHigh ?? "null"}</td><td>{row.discountedLow ?? "null"}</td></tr>)}</tbody></table>
            </div>
            <div style={{ overflowX: "auto" }}><strong>5. Odiskonterad grafinput high/low</strong>
              <table><thead><tr><th>t</th><th>år</th><th>input high (dcf)</th><th>input low (nav)</th></tr></thead><tbody>{projectChartModel.rawFlowSeries.dcfSeriesRawAll.map((_, idx) => <tr key={`raw-${idx}`}><td>{idx}</td><td>{projectDebug?.yearsByPeriod?.[idx] ?? "null"}</td><td>{projectChartModel.rawFlowSeries.dcfSeriesRawAll[idx] ?? "null"}</td><td>{projectChartModel.rawFlowSeries.navSeriesRawAll[idx] ?? "null"}</td></tr>)}</tbody></table>
            </div>
            <div style={{ overflowX: "auto" }}><strong>6. FCFF från produktionstabell</strong><table><thead><tr><th>t</th><th>år</th><th>fcffUSD</th><th>source</th></tr></thead><tbody>{(projectDebug?.fcffProductionTableSeries ?? []).map((v, idx) => <tr key={`prod-${idx}`}><td>{idx}</td><td>{projectDebug?.yearsByPeriod?.[idx] ?? "null"}</td><td>{v ?? "null"}</td><td>snapshot.series.fcffUSD</td></tr>)}</tbody></table></div>
            <div style={{ overflowX: "auto" }}><strong>7. FCFF för NPV</strong><table><thead><tr><th>t</th><th>år</th><th>fcffUSD</th><th>source</th></tr></thead><tbody>{(projectDebug?.fcffNpvSeries ?? []).map((v, idx) => <tr key={`npv-${idx}`}><td>{idx}</td><td>{projectDebug?.yearsByPeriod?.[idx] ?? "null"}</td><td>{v ?? "null"}</td><td>getProjectInputs().series.fcfUSD</td></tr>)}</tbody></table></div>
            <div style={{ overflowX: "auto" }}><strong>8. Matchningstabell produktionstabell vs NPV</strong><div>FCFF-serier matchar: {fcffComparison?.match ? "JA" : "NEJ"}</div><table><thead><tr><th>t</th><th>fcff_productionTable</th><th>fcff_npv</th><th>diff</th></tr></thead><tbody>{fcffComparison?.rows.map((row) => <tr key={`cmp-${row.periodIndex}`}><td>{row.periodIndex}</td><td>{row.fcffProductionTable ?? "null"}</td><td>{row.fcffNpv ?? "null"}</td><td>{row.diff ?? "null"}</td></tr>)}</tbody></table></div>
            <div style={{ overflowX: "auto" }}><strong>9. Matchningstabell grafinput vs FCFF</strong><table><thead><tr><th>t</th><th>graf high input</th><th>graf low input</th><th>fcff</th></tr></thead><tbody>{projectChartModel.rawFlowSeries.dcfSeriesRawAll.map((_, idx) => <tr key={`gfcff-${idx}`}><td>{idx}</td><td>{projectChartModel.rawFlowSeries.dcfSeriesRawAll[idx] ?? "null"}</td><td>{projectChartModel.rawFlowSeries.navSeriesRawAll[idx] ?? "null"}</td><td>{projectDebug?.fcffNpvSeries?.[idx] ?? "null"}</td></tr>)}</tbody></table></div>
            <div><strong>10. Diagnos fallande kurva</strong><div>Första år high faller: {projectCurveDiagnosis?.firstHighDrop?.calendarYear ?? "saknas"}</div><div>Första år low faller: {projectCurveDiagnosis?.firstLowDrop?.calendarYear ?? "saknas"}</div><div>Orsak: jämför odiskonterat flöde och diskonteringsfaktor i tabell 4.</div></div>
          </div>
        </details>
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
