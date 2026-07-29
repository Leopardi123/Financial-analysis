import { useMemo } from "react";
import { valueRangeChartHeader } from "./corporateChartRows";
import ValueRangeChart from "./ValueRangeChart";
import { buildValueRangeChartRow } from "./valueRangeCurve";
import { selectValuationChart, type ValuationTimeline } from "../../lib/valuation/canonicalValuationTimeline.ts";

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
  canonicalTimeline?: ValuationTimeline | null;
  canonicalStartPeriods?: number[];
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
  const { mode = "corporate", priceToday, currencyCode, projectDebug, canonicalTimeline, canonicalStartPeriods } = props;
  const isProjectMode = mode === "project";

  const projectChartModel = useMemo(() => {
    if (!canonicalTimeline?.periods.length) return null;
    const selection = selectValuationChart(canonicalTimeline, canonicalStartPeriods);
    const periods = selection.points;
    const domainValues = periods
      .flatMap((period) => [period.high, period.low])
      .filter((value): value is number => isFiniteNumber(value));
    if (isFiniteNumber(priceToday)) domainValues.push(priceToday);
    const valueWindow = computeViewWindow(domainValues);
    if (!valueWindow) return null;
    const tpOffset = canonicalTimeline.productionStartPeriod ?? -1;
    const rows = periods.map((period) => buildValueRangeChartRow({
      year: period.calendarYear,
      low: period.low,
      high: period.high,
      currentPrice: period.isToday && isFiniteNumber(priceToday) ? priceToday : null,
      annotateCurrent: period.isToday,
      annotateProductionStart: period.isStart,
      highlightPeakLow: period.periodIndex === selection.peakLow?.periodIndex,
      highlightPeakHigh: period.periodIndex === selection.peakHigh?.periodIndex,
      peakTooltip: `År: ${period.calendarYear}`,
      format: formatPerShareValue,
    }));
    const data = [[...valueRangeChartHeader], ...rows] as (string | number | null | { role: string; type?: string })[][];
    if (!isProjectChartDataTypeSafe(data)) return null;
    const debugRows = periods.map((period) => ({
      periodIndex: period.periodIndex,
      calendarYear: period.calendarYear,
      undiscountedHigh: period.high,
      undiscountedLow: period.low,
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
      ticks: periods.filter((period) => period.isToday || period.isStart || period.periodIndex === selection.peakLow?.periodIndex || period.periodIndex === selection.peakHigh?.periodIndex)
        .map((period) => ({ v: period.calendarYear, f: String(period.calendarYear) })),
      peakYear: selection.peakHigh?.calendarYear ?? periods[0].calendarYear,
      valueWindow,
      discountRate: null,
      tpOffset,
      debugRows,
      rawFlowSeries: {
        dcfSeriesRawAll: periods.map((period) => period.high),
        navSeriesRawAll: periods.map((period) => period.low),
        dcfSeriesRaw: periods.map((period) => period.high),
        navSeriesRaw: periods.map((period) => period.low),
      },
    };
  }, [canonicalStartPeriods, canonicalTimeline, priceToday]);



  if (!isProjectMode && projectChartModel) {
    return <div className="spot-range-chart-guard" style={{ marginTop: 8 }}><ValueRangeChart data={projectChartModel.data} ticks={projectChartModel.ticks} yearMin={projectChartModel.yearNow - 1} yearMax={projectChartModel.yearNow + Math.max(1, projectChartModel.data.length - 2)} peakYear={projectChartModel.peakYear} valueWindow={projectChartModel.valueWindow} currencyCode={currencyCode} /></div>;
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
              {projectChartModel.debugRows.map((period) => <tr key={period.periodIndex}><td>{period.periodIndex}</td><td>{period.calendarYear}</td><td>{period.undiscountedHigh ?? "null"}</td><td>{period.undiscountedLow ?? "null"}</td></tr>)}
            </tbody></table></div>
          </details>
        )}
      </div>
    );
  }

  return <p className="status empty" style={{ margin: 0 }}>Saknar canonical valuation timeline</p>;
}
