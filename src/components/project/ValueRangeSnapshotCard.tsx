import { useMemo, useState } from "react";
import { valueRangeChartHeader } from "./corporateChartRows";
import ValueRangeChart from "./ValueRangeChart";
import type { ValuationTimeline } from "../../lib/valuation/canonicalValuationTimeline.ts";
import { buildValuationChartRenderModel } from "./valuationChartPresentation.ts";
import type { CorporateQualityMultipleOutput } from "../../lib/corporate/multipleContrast/types.ts";
import MultipleContrastPanel from "./MultipleContrastPanel.tsx";
import { VALUE_RANGE_CHART_COLORS } from "./valueRangeChartOptions.ts";
import {
  activeOverlayDomainValues,
  buildCombinedTargetSeries,
  buildQualityMultipleContrastSeries,
  buildStaticMultipleContrastSeries,
  type MultipleContrastBasis,
  type MultipleContrastVisibility,
} from "./multipleContrastPresentation.ts";

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
  corporateQualityMultipleTimeSeries?: CorporateQualityMultipleOutput | null;
  fxUSDToTarget?: number | null;
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
  const { mode = "corporate", priceToday, currencyCode, projectDebug, canonicalTimeline, canonicalStartPeriods, corporateTimeSeries, corporateQualityMultipleTimeSeries, fxUSDToTarget } = props;
  const isProjectMode = mode === "project";
  const [contrastOpen, setContrastOpen] = useState(false);
  const [multipleBasis, setMultipleBasis] = useState<MultipleContrastBasis>('annual');
  // The legacy Corporate graph already displayed its static 5x–7x band. Keeping
  // this enabled preserves the closed-panel/default chart exactly.
  const [contrastVisibility, setContrastVisibility] = useState<MultipleContrastVisibility>({
    showStaticMultipleBand: true,
    showQualityMultipleBand: false,
    showCombinedTarget: false,
  });

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
    const qualityRows = corporateQualityMultipleTimeSeries?.rows ?? [];
    const staticSeries = isProjectMode ? [] : buildStaticMultipleContrastSeries({
      basis: multipleBasis,
      staticRows: corporateTimeSeries?.rows ?? [],
      qualityRows,
      bridgeRows: canonicalTimeline.periods.map((row) => ({ year: row.calendarYear, netCashTarget: row.netCashTarget, sharesPostFinancing: row.sharesPf })),
      fxUSDToTarget: fxUSDToTarget ?? null,
      currencyCode,
    });
    const canonicalSharesForPerShareByYear = new Map(canonicalTimeline.periods.map((row) => [
      row.calendarYear,
      row.canonicalSharesForPerShare,
    ]));
    const qualitySeries = isProjectMode ? [] : buildQualityMultipleContrastSeries({
      basis: multipleBasis,
      qualityRows,
      canonicalSharesForPerShareByYear,
      currencyCode,
    });
    const combinedSeries = isProjectMode ? [] : buildCombinedTargetSeries({
      years: periods.map((period) => period.calendarYear),
      navPerShareByYear: new Map(canonicalTimeline.periods.map((row) => [row.calendarYear, row.navPerShareTarget])),
      staticSeries, qualitySeries, visibility: contrastVisibility, currencyCode,
    });
    const staticByYear = new Map(staticSeries.map((row) => [row.year, row]));
    const qualityByYear = new Map(qualitySeries.map((row) => [row.year, row]));
    const combinedByYear = new Map(combinedSeries.map((row) => [row.year, row]));
    const multiplePeak = isProjectMode || !contrastVisibility.showStaticMultipleBand ? null : periods.reduce<{ year: number; base: number; low: number; high: number } | null>((peak, period) => {
      const row = staticByYear.get(period.calendarYear);
      if (!isFiniteNumber(row?.mid) || !isFiniteNumber(row.low) || !isFiniteNumber(row.high)) return peak;
      return peak === null || row.mid > peak.base ? { year: period.calendarYear, base: row.mid, low: row.low, high: row.high } : peak;
    }, null);
    const qualityPeak = isProjectMode || !contrastVisibility.showQualityMultipleBand ? null : periods.reduce<{ year: number; base: number; low: number; high: number } | null>((peak, period) => {
      const row = qualityByYear.get(period.calendarYear);
      if (!isFiniteNumber(row?.mid) || !isFiniteNumber(row.low) || !isFiniteNumber(row.high)) return peak;
      return peak === null || row.mid > peak.base ? { year: period.calendarYear, base: row.mid, low: row.low, high: row.high } : peak;
    }, null);
    const domainValues = periods
      .flatMap((period) => [period.high, period.low])
      .filter((value): value is number => isFiniteNumber(value));
    domainValues.push(...activeOverlayDomainValues({ staticSeries, qualitySeries, combinedSeries, visibility: contrastVisibility }));
    if (isFiniteNumber(priceToday)) domainValues.push(priceToday);
    const valueWindow = computeViewWindow(domainValues);
    if (!valueWindow) return null;
    const tpOffset = canonicalTimeline.productionStartPeriod ?? -1;
    const rows = renderModel.rows;
    const staticHeader = [
      { label: 'EV/EBITDA 6×', type: 'number' },
      { role: 'tooltip', type: 'string' },
      { id: 'staticLow', role: 'interval', type: 'number', label: '5×' },
      { id: 'staticHigh', role: 'interval', type: 'number', label: '7×' },
      { label: 'EV/EBITDA 5× boundary', type: 'number' },
      { label: 'EV/EBITDA 7× boundary', type: 'number' },
      { label: 'Peak EV/EBITDA', type: 'number' },
      { role: 'annotation', type: 'string' },
    ];
    const qualityHeader = [
      { label: 'Kvalitetsjusterat EV/EBITDA', type: 'number' },
      { role: 'tooltip', type: 'string' },
      { id: 'qualityLow', role: 'interval', type: 'number', label: 'Quality low' },
      { id: 'qualityHigh', role: 'interval', type: 'number', label: 'Quality high' },
      { label: 'Kvalitetsjusterad low boundary', type: 'number' },
      { label: 'Kvalitetsjusterad high boundary', type: 'number' },
      { label: 'Peak kvalitetsjusterad EV/EBITDA', type: 'number' },
      { role: 'annotation', type: 'string' },
    ];
    const combinedHeader = [{ label: 'Kombinerad riktkurs 70/30', type: 'number' }, { role: 'tooltip', type: 'string' }];
    const chartRows = isProjectMode ? rows : rows.map((row, index) => {
      const staticPoint = staticByYear.get(periods[index].calendarYear);
      const qualityPoint = qualityByYear.get(periods[index].calendarYear);
      const combinedPoint = combinedByYear.get(periods[index].calendarYear);
      return [
        ...row,
        ...(contrastVisibility.showStaticMultipleBand ? [
          staticPoint?.mid ?? null, staticPoint?.tooltip ?? null, staticPoint?.low ?? null, staticPoint?.high ?? null,
          staticPoint?.low ?? null, staticPoint?.high ?? null,
          multiplePeak?.year === periods[index].calendarYear ? multiplePeak.base : null,
          multiplePeak?.year === periods[index].calendarYear ? `${formatPerShareValue(multiplePeak.low)}-${formatPerShareValue(multiplePeak.high)}` : null,
        ] : []),
        ...(contrastVisibility.showQualityMultipleBand ? [
          qualityPoint?.mid ?? null, qualityPoint?.tooltip ?? null, qualityPoint?.low ?? null, qualityPoint?.high ?? null,
          qualityPoint?.low ?? null, qualityPoint?.high ?? null,
          qualityPeak?.year === periods[index].calendarYear ? qualityPeak.base : null,
          qualityPeak?.year === periods[index].calendarYear ? `${formatPerShareValue(qualityPeak.low)}-${formatPerShareValue(qualityPeak.high)}` : null,
        ] : []),
        ...(contrastVisibility.showCombinedTarget ? [combinedPoint?.value ?? null, combinedPoint?.tooltip ?? null] : []),
      ];
    });
    const overlayHeaders = isProjectMode ? [] : [
      ...(contrastVisibility.showStaticMultipleBand ? staticHeader : []),
      ...(contrastVisibility.showQualityMultipleBand ? qualityHeader : []),
      ...(contrastVisibility.showCombinedTarget ? combinedHeader : []),
    ];
    const data = [[...valueRangeChartHeader, ...overlayHeaders], ...chartRows] as (string | number | null | { role: string; type?: string })[][];
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
    let nextSeries = 11;
    const overlaySeries: Record<number, Record<string, unknown>> = {};
    const legendItems: Array<{ label: string; className: string }> = isProjectMode ? [] : [
      { label: 'DCF', className: 'legend-dcf' },
      { label: 'NAV', className: 'legend-nav' },
    ];
    if (!isProjectMode && contrastVisibility.showStaticMultipleBand) {
      overlaySeries[nextSeries] = { type: 'line', color: VALUE_RANGE_CHART_COLORS.staticMultiple, lineWidth: 0.8, pointSize: 0, visibleInLegend: false };
      overlaySeries[nextSeries + 1] = { type: 'line', color: VALUE_RANGE_CHART_COLORS.staticMultipleBoundary, lineWidth: 0.62, pointSize: 0, visibleInLegend: false, enableInteractivity: false };
      overlaySeries[nextSeries + 2] = { type: 'line', color: VALUE_RANGE_CHART_COLORS.staticMultipleBoundary, lineWidth: 0.62, pointSize: 0, visibleInLegend: false, enableInteractivity: false };
      overlaySeries[nextSeries + 3] = { type: 'scatter', color: VALUE_RANGE_CHART_COLORS.staticMultiple, pointSize: 7, lineWidth: 0, visibleInLegend: false };
      nextSeries += 4;
      if (staticSeries.some((row) => isFiniteNumber(row.mid))) legendItems.push({ label: 'Naturligt EV/EBITDA 5x–7x', className: 'legend-static-multiple' });
    }
    if (!isProjectMode && contrastVisibility.showQualityMultipleBand) {
      overlaySeries[nextSeries] = { type: 'line', color: VALUE_RANGE_CHART_COLORS.qualityMultiple, lineWidth: 0.8, pointSize: 0, visibleInLegend: false };
      overlaySeries[nextSeries + 1] = { type: 'line', color: VALUE_RANGE_CHART_COLORS.qualityMultiple, lineWidth: 0.62, pointSize: 0, visibleInLegend: false, enableInteractivity: false };
      overlaySeries[nextSeries + 2] = { type: 'line', color: VALUE_RANGE_CHART_COLORS.qualityMultiple, lineWidth: 0.62, pointSize: 0, visibleInLegend: false, enableInteractivity: false };
      overlaySeries[nextSeries + 3] = { type: 'scatter', color: VALUE_RANGE_CHART_COLORS.qualityMultiple, pointSize: 7, lineWidth: 0, visibleInLegend: false, annotations: { textStyle: { color: VALUE_RANGE_CHART_COLORS.qualityMultiple } } };
      nextSeries += 4;
      if (qualitySeries.some((row) => isFiniteNumber(row.mid))) legendItems.push({ label: 'Kvalitetsjusterat EV/EBITDA', className: 'legend-quality-multiple' });
    }
    if (!isProjectMode && contrastVisibility.showCombinedTarget) {
      overlaySeries[nextSeries] = { type: 'line', color: '#be123c', lineWidth: 1.8, pointSize: 2, visibleInLegend: false };
      if (combinedSeries.some((row) => isFiniteNumber(row.value))) legendItems.push({ label: 'Kombinerad riktkurs 70/30', className: 'legend-combined-target' });
    }
    return {
      yearNow: periods[0].calendarYear,
      data,
      ticks: periods.filter((period) => period.isToday || period.isStart || period.periodIndex === selection.peakLow?.periodIndex || period.periodIndex === selection.peakHigh?.periodIndex || period.calendarYear === multiplePeak?.year || period.calendarYear === qualityPeak?.year)
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
      overlaySeries,
      legendItems,
      combinedAvailable: combinedSeries.some((row) => isFiniteNumber(row.value)),
    };
  }, [canonicalStartPeriods, canonicalTimeline, contrastVisibility, corporateQualityMultipleTimeSeries, corporateTimeSeries, currencyCode, fxUSDToTarget, isProjectMode, multipleBasis, priceToday]);



  if (!isProjectMode && projectChartModel) {
    const diagnosticRow = corporateQualityMultipleTimeSeries?.rows.find((row) => row.qualityStatus === 'COMPUTABLE' && isFiniteNumber(row.annualEbitdaUSD) && row.annualEbitdaUSD > 0)
      ?? corporateQualityMultipleTimeSeries?.rows.find((row) => row.qualityDiagnostics.length > 0)
      ?? null;
    return <div className="spot-range-chart-guard" style={{ marginTop: 8 }}>
      <ValueRangeChart data={projectChartModel.data} ticks={projectChartModel.ticks} yearMin={projectChartModel.yearNow - 1} yearMax={projectChartModel.chartEndYear} peakYear={projectChartModel.peakYear} valueWindow={projectChartModel.valueWindow} currencyCode={currencyCode} overlaySeries={projectChartModel.overlaySeries} legendItems={contrastOpen || multipleBasis !== 'annual' || contrastVisibility.showQualityMultipleBand || contrastVisibility.showCombinedTarget || !contrastVisibility.showStaticMultipleBand ? projectChartModel.legendItems : []} />
      <MultipleContrastPanel open={contrastOpen} onToggle={() => setContrastOpen((open) => !open)} basis={multipleBasis} onBasisChange={setMultipleBasis} visibility={contrastVisibility} onVisibilityChange={setContrastVisibility} diagnosticRow={diagnosticRow} combinedAvailable={projectChartModel.combinedAvailable} />
    </div>;
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
