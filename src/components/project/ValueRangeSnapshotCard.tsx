import { useMemo } from "react";
import { valueRangeChartHeader } from "./corporateChartRows";
import ValueRangeChart from "./ValueRangeChart";
import type { ValuationTimeline } from "../../lib/valuation/canonicalValuationTimeline.ts";
import { buildValuationChartRenderModel } from "./valuationChartPresentation.ts";

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
    rows: Array<{ period: number; year: number; npvPerShare: number | null; dcfPerShare: number | null; dcfExCapexPerShare?: number | null; navPerShare: number | null; sharesPf: number | null; ebitdaTarget?: number | null; ev5xTarget?: number | null; ev6xTarget?: number | null; ev7xTarget?: number | null; evEbitda5xPerShare?: number | null; evEbitda6xPerShare?: number | null; evEbitda7xPerShare?: number | null }>;
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
  const { mode = "corporate", priceToday, currencyCode, projectDebug, canonicalTimeline, canonicalStartPeriods, corporateTimeSeries } = props;
  const isProjectMode = mode === "project";

  const projectChartModel = useMemo(() => {
    if (!canonicalTimeline?.periods.length) return null;
    const renderModel = buildValuationChartRenderModel({
      timeline: canonicalTimeline,
      scope: isProjectMode ? 'project' : 'corporate',
      startPeriods: canonicalStartPeriods,
      priceToday: isFiniteNumber(priceToday) ? priceToday : null,
      format: formatPerShareValue,
    });
    const selection = renderModel.selection;
    const periods = renderModel.displayRange.points;
    const multipleByYear = new Map((corporateTimeSeries?.rows ?? []).map((row) => [row.year, row]));
    const multipleValues = isProjectMode ? [] : periods.flatMap((period) => {
      const row = multipleByYear.get(period.calendarYear);
      if (!isFiniteNumber(row?.ebitdaTarget) || row.ebitdaTarget <= 0) return [];
      return [row?.evEbitda5xPerShare, row?.evEbitda6xPerShare, row?.evEbitda7xPerShare].filter(isFiniteNumber);
    });
    const domainValues = periods
      .flatMap((period) => [period.high, period.low])
      .filter((value): value is number => isFiniteNumber(value));
    domainValues.push(...multipleValues);
    if (isFiniteNumber(priceToday)) domainValues.push(priceToday);
    const valueWindow = computeViewWindow(domainValues);
    if (!valueWindow) return null;
    const tpOffset = canonicalTimeline.productionStartPeriod ?? -1;
    const rows = renderModel.rows;
    const multipleHeader = [
      { label: 'EV/EBITDA 6×', type: 'number' },
      { role: 'tooltip', type: 'string' },
      { role: 'interval', type: 'number', label: '5×' },
      { role: 'interval', type: 'number', label: '7×' },
      { label: 'EV/EBITDA 5× boundary', type: 'number' },
      { label: 'EV/EBITDA 7× boundary', type: 'number' },
    ];
    const formatMoney = (value: number | null | undefined) => isFiniteNumber(value) ? `${formatPerShareValue(value)}${currencyCode ? ` ${currencyCode}` : ''}` : 'n/a';
    const chartRows = isProjectMode ? rows : rows.map((row, index) => {
      const multiple = multipleByYear.get(periods[index].calendarYear);
      const showUncertaintyBand = isFiniteNumber(multiple?.ebitdaTarget) && multiple.ebitdaTarget > 0;
      const tooltip = multiple && isFiniteNumber(multiple.evEbitda6xPerShare) ? [
        `År: ${multiple.year}`,
        `EBITDA: ${formatMoney(multiple.ebitdaTarget)}`,
        `5× EV: ${formatMoney(multiple.ev5xTarget)}`,
        `6× EV: ${formatMoney(multiple.ev6xTarget)}`,
        `7× EV: ${formatMoney(multiple.ev7xTarget)}`,
        `Värde/aktie (5×): ${formatMoney(multiple.evEbitda5xPerShare)}`,
        `Värde/aktie (6×): ${formatMoney(multiple.evEbitda6xPerShare)}`,
        `Värde/aktie (7×): ${formatMoney(multiple.evEbitda7xPerShare)}`,
      ].join('\n') : null;
      return [
        ...row,
        showUncertaintyBand ? multiple?.evEbitda6xPerShare ?? null : null,
        showUncertaintyBand ? tooltip : null,
        showUncertaintyBand ? multiple?.evEbitda5xPerShare ?? null : null,
        showUncertaintyBand ? multiple?.evEbitda7xPerShare ?? null : null,
        showUncertaintyBand ? multiple?.evEbitda5xPerShare ?? null : null,
        showUncertaintyBand ? multiple?.evEbitda7xPerShare ?? null : null,
      ];
    });
    const data = [[...valueRangeChartHeader, ...(isProjectMode ? [] : multipleHeader)], ...chartRows] as (string | number | null | { role: string; type?: string })[][];
    if (isProjectMode && !isProjectChartDataTypeSafe(data)) return null;
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
      chartEndYear: renderModel.displayRange.chartEndYear,
      trace: renderModel.trace,
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
  }, [canonicalStartPeriods, canonicalTimeline, corporateTimeSeries, currencyCode, isProjectMode, priceToday]);



  if (!isProjectMode && projectChartModel) {
    return <div className="spot-range-chart-guard" style={{ marginTop: 8 }}><ValueRangeChart data={projectChartModel.data} ticks={projectChartModel.ticks} yearMin={projectChartModel.yearNow - 1} yearMax={projectChartModel.chartEndYear} peakYear={projectChartModel.peakYear} valueWindow={projectChartModel.valueWindow} currencyCode={currencyCode} /></div>;
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
          yearMax={projectChartModel.chartEndYear}
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
