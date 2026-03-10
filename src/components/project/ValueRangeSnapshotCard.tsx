import { useMemo } from "react";
import { Chart } from "react-google-charts";
import { computeLista2CfDcfMetrics } from "../../lib/snapshot/lista2CfDcf";

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
    tpPeriod?: number | null;
    debugEnabled?: boolean;
    fxUsdToTarget?: number | null;
    sharesPostFinancing?: number | null;
    netCashTarget?: number | null;
    capexSeries?: Array<number | null> | null;
    sharesCurrent?: number | null;
    debtTarget?: number | null;
    cashTarget?: number | null;
    equityFraction?: number | null;
    debtFraction?: number | null;
    metricPanelSharesUsed?: number | null;
    marketBoxSharesCurrent?: number | null;
    marketBoxSharesPf?: number | null;
    snapshotOrStateIdentifier?: string | null;
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


function computeCorrectDcfAt(args: { fcffSeries: Array<number | null>; discountRate: number; t: number }): number | null {
  let sum = 0;
  for (let k = args.t; k < args.fcffSeries.length; k += 1) {
    const cf = args.fcffSeries[k];
    if (!isFiniteNumber(cf)) return null;
    sum += cf / ((1 + args.discountRate) ** (k - args.t));
  }
  return Number.isFinite(sum) ? sum : null;
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
    const highBeforeFixByIndex: Array<number | null> = Array.from({ length: totalLen }, () => null);
    const highExponentBeforeByIndex: Array<number | null> = Array.from({ length: totalLen }, () => null);
    const highExponentAfterByIndex: Array<number | null> = Array.from({ length: totalLen }, () => null);

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
            highBeforeFixByIndex[idx] = dcfPresentAtIdx * ((1 + inferredRate) ** idx);
            highExponentBeforeByIndex[idx] = idx;
            highByIndex[idx] = dcfPresentAtIdx * ((1 + inferredRate) ** flowIndex);
            highExponentAfterByIndex[idx] = flowIndex;
          } else {
            highBeforeFixByIndex[idx] = dcfPresentAtIdx;
            highByIndex[idx] = dcfPresentAtIdx;
          }
        }
      }
    }

    if (lowTp !== null) lowByIndex[tpOffset] = lowTp;
    if (highTp !== null) {
      highByIndex[tpOffset] = highTp;
      highBeforeFixByIndex[tpOffset] = highTp;
      highExponentBeforeByIndex[tpOffset] = 0;
      highExponentAfterByIndex[tpOffset] = 0;
    }

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
        highBeforeFix: highBeforeFixByIndex[idx],
        highExponentBefore: highExponentBeforeByIndex[idx],
        highExponentAfter: highExponentAfterByIndex[idx],
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

  const graphDebug2 = useMemo(() => {
    if (!projectChartModel || !projectDebug?.debugEnabled) return null;
    const r = isFiniteNumber(projectDebug.discountRate) ? projectDebug.discountRate : null;
    const tp = Number.isInteger(projectDebug.tpPeriod) ? (projectDebug.tpPeriod as number) : null;
    const fcffSeries = Array.isArray(projectDebug.fcffNpvSeries) ? projectDebug.fcffNpvSeries : [];
    const yearsByPeriod = Array.isArray(projectDebug.yearsByPeriod) ? projectDebug.yearsByPeriod : [];

    const points = projectChartModel.debugRows
      .map((row) => {
        const idx = row.periodIndex;
        const flowIndex = idx - projectChartModel.tpOffset;
        const postTp = idx >= projectChartModel.tpOffset;
        const sourceHighRaw = flowIndex >= 0 ? (projectChartModel.rawFlowSeries.dcfSeriesRaw[flowIndex] ?? null) : null;
        const sourceLowRaw = flowIndex >= 0 ? (projectChartModel.rawFlowSeries.navSeriesRaw[flowIndex] ?? null) : null;
        const exponentHigh = row.highExponentAfter ?? null;
        const scalingHigh = exponentHigh !== null && projectChartModel.inferredRate !== null ? ((1 + projectChartModel.inferredRate) ** exponentHigh) : null;
        const graphHighValue = row.undiscountedHigh ?? null;
        const graphHighValueBeforeFix = row.highBeforeFix ?? null;
        const exponentHighBeforeFix = row.highExponentBefore ?? null;
        const graphLowValue = row.undiscountedLow ?? null;
        const correctHighValue = (r !== null && tp !== null && postTp) ? computeCorrectDcfAt({ fcffSeries, discountRate: r, t: tp + flowIndex }) : null;
        const diffHigh = graphHighValue !== null && correctHighValue !== null ? graphHighValue - correctHighValue : null;
        return {
          periodIndex: idx,
          calendarYear: row.calendarYear,
          tp,
          flowIndex,
          postTp,
          sourceHighRaw,
          sourceLowRaw,
          sourceBasisHigh: 'present-value per share from chartFlows.dcfProdstartPresentPerShareSeries',
          sourceBasisLow: 'per-share NAV from chartFlows.navProdstartPerShareSeries',
          discountRate: r,
          exponentHigh,
          scalingHigh,
          graphHighValue,
          graphHighValueBeforeFix,
          exponentHighBeforeFix,
          graphLowValue,
          correctHighValue,
          diffHigh,
          calendarFromSeries: yearsByPeriod[tp !== null ? tp + flowIndex : -1] ?? null,
        };
      })
      .filter((row) => row.postTp);

    const focus = points.filter((row) => row.flowIndex >= 0 && row.flowIndex <= 3);

    const centralTodayBasisRows = focus.map((row) => {
      const tpAtPoint = tp !== null ? tp + row.flowIndex : null;
      const hasCentralInputs = tpAtPoint !== null && r !== null && fcffSeries.length > 0;
      const central = hasCentralInputs
        ? computeLista2CfDcfMetrics({
            fcfUSD_total: fcffSeries,
            masterN: fcffSeries.length - 1,
            productionStartPeriod: tpAtPoint,
            discountRate: r as number,
            shares_post_financing: projectDebug.sharesPostFinancing ?? null,
            fx_USD_to_TargetCurrency: projectDebug.fxUsdToTarget ?? null,
            npvToday_USD: null,
            netCash_t0_post_TargetCurrency: projectDebug.netCashTarget ?? null,
            capexUSD_total: Array.isArray(projectDebug.capexSeries) ? projectDebug.capexSeries : undefined,
          })
        : null;

      const highPresentUsedNow = row.sourceHighRaw ?? null;
      const highPresentFromCentral = central?.metrics.DCF_prodStart_present_perShare_TargetCurrency ?? null;
      const lowPresentUsedNow = (() => {
        if (row.sourceLowRaw === null || r === null || tp === null || row.flowIndex < 0) return null;
        return row.sourceLowRaw / ((1 + r) ** (tp + row.flowIndex));
      })();
      const lowPresentFromCentral = central?.metrics.NAV_prodStart_perShare_TargetCurrency ?? null;

      return {
        pointLabel: row.flowIndex === 0 ? 'TP' : `TP+${row.flowIndex}`,
        periodIndex: row.periodIndex,
        calendarYear: row.calendarYear,
        highPresentUsedNow,
        highPresentFromCentral,
        lowPresentUsedNow,
        lowPresentFromCentral,
        highUsedSourceName: 'chartFlows.dcfProdstartPresentPerShareSeries',
        highCentralSourceName: 'derived from NPV/List2 central FCFF + computeLista2CfDcfMetrics',
        lowUsedSourceName: 'chartFlows.navProdstartPerShareSeries (normalized to today-basis in debug only)',
        lowCentralSourceName: 'derived from NPV/List2 central FCFF + computeLista2CfDcfMetrics',
        diffHighPresent: highPresentUsedNow !== null && highPresentFromCentral !== null ? highPresentUsedNow - highPresentFromCentral : null,
        diffLowPresent: lowPresentUsedNow !== null && lowPresentFromCentral !== null ? lowPresentUsedNow - lowPresentFromCentral : null,
        notes: lowPresentUsedNow === null ? 'Low used-now kunde inte normaliseras till today-basis med tillgängliga inputs.' : null,
      };
    });

    return { points, focus, centralTodayBasisRows };
  }, [projectChartModel, projectDebug]);

  const pointLevelFinancingTrace = useMemo(() => {
    if (!projectChartModel || !projectDebug?.debugEnabled) return null;
    const sharesUsed = (typeof projectDebug.sharesPostFinancing === 'number' && Number.isFinite(projectDebug.sharesPostFinancing) && projectDebug.sharesPostFinancing > 0)
      ? projectDebug.sharesPostFinancing
      : ((typeof projectDebug.sharesCurrent === 'number' && Number.isFinite(projectDebug.sharesCurrent) && projectDebug.sharesCurrent > 0) ? projectDebug.sharesCurrent : null);
    const tpIdx = projectChartModel.tpOffset;

    const makePointName = (idx: number): string => {
      if (idx === 0) return 'today/now';
      if (idx === tpIdx) return 'TP';
      if (idx > tpIdx) return `TP+${idx - tpIdx}`;
      return `preTP-${tpIdx - idx}`;
    };

    const traceRows = projectChartModel.debugRows
      .filter((row) => row.periodIndex === 0 || row.periodIndex === tpIdx || (row.periodIndex > tpIdx && row.periodIndex <= tpIdx + 3))
      .map((row, idx, arr) => {
        const periodIndex = row.periodIndex;
        const flowIndex = periodIndex - tpIdx;
        const highRaw = row.undiscountedHigh ?? null;
        const lowRaw = row.undiscountedLow ?? null;
        const renderedHigh = (highRaw !== null && lowRaw !== null) ? Math.max(highRaw, lowRaw) : highRaw;
        const renderedLow = (highRaw !== null && lowRaw !== null) ? Math.min(highRaw, lowRaw) : lowRaw;
        const pointSeriesSourceHigh = periodIndex > tpIdx ? 'chartFlows.dcfProdstartPresentPerShareSeries' : (periodIndex === tpIdx ? 'tpHigh prop (fallback chartFlows[0])' : 'npvHigh/tp interpolation pipeline');
        const pointSeriesSourceLow = periodIndex > tpIdx ? 'chartFlows.navProdstartPerShareSeries' : (periodIndex === tpIdx ? 'tpLow prop (fallback chartFlows[0])' : 'npvLow/tp interpolation pipeline');
        const pointAnchorHigh = periodIndex === tpIdx ? 'tpHigh prop from list2 DCF_perShare' : (periodIndex === 0 ? 'npvHigh prop from list2 DCF_Target_discounted_perShare' : 'none');
        const pointAnchorLow = periodIndex === tpIdx ? 'tpLow prop from list2 NAV_prodStart_perShare' : (periodIndex === 0 ? 'npvLow prop from list2 NPV_perShare' : 'none');
        const exponentUsed = periodIndex > tpIdx ? (row.highExponentAfter ?? null) : (periodIndex === tpIdx ? 0 : null);
        const scalingFactorUsed = (periodIndex > tpIdx && projectChartModel.inferredRate !== null && exponentUsed !== null)
          ? ((1 + projectChartModel.inferredRate) ** exponentUsed)
          : null;
        const valueBasisUsed = periodIndex > tpIdx ? 'year-basis' : (periodIndex === tpIdx ? 'tp-basis' : 'present/today');
        const prev = idx > 0 ? arr[idx - 1] : null;
        return {
          point_name: makePointName(periodIndex),
          periodIndex,
          flowIndex: periodIndex >= tpIdx ? flowIndex : null,
          calendarYear: row.calendarYear,
          shares_used: sharesUsed,
          shares_source_name: sharesUsed === projectDebug.sharesPostFinancing ? 'shares_post_financing from financing block' : 'shares_current fallback',
          uses_shares_post_financing: sharesUsed !== null && sharesUsed === projectDebug.sharesPostFinancing,
          shares_current: projectDebug.sharesCurrent ?? null,
          shares_post_financing: projectDebug.sharesPostFinancing ?? null,
          debt_used: projectDebug.debtTarget ?? null,
          debt_source_name: 'debt_TargetCurrency from project inputs/financing',
          cash_used: projectDebug.cashTarget ?? null,
          cash_source_name: 'cash_TargetCurrency from project inputs/financing',
          financing_mix_summary: `equity_fraction=${projectDebug.equityFraction ?? 'null'}, debt_fraction=${projectDebug.debtFraction ?? 'null'}`,
          enterprise_value_used: null,
          enterprise_value_source_name: null,
          equity_value_used_high: renderedHigh !== null && sharesUsed !== null ? renderedHigh * sharesUsed : null,
          equity_value_used_low: renderedLow !== null && sharesUsed !== null ? renderedLow * sharesUsed : null,
          equity_value_source_name: 'per-share render value × shares_used (debug reconstruction)',
          value_basis_used: valueBasisUsed,
          per_share_value_before_render_high: highRaw,
          per_share_value_before_render_low: lowRaw,
          render_formula_high: periodIndex > tpIdx ? 'raw_high * (1+inferredRate)^flowIndex' : (periodIndex === tpIdx ? 'tpHigh anchor' : 'today-to-tp interpolation/discount anchor'),
          render_formula_low: periodIndex > tpIdx ? 'raw_low direct (no scaling)' : (periodIndex === tpIdx ? 'tpLow anchor' : 'today-to-tp interpolation/growth anchor'),
          exponent_used_high: exponentUsed,
          exponent_used_low: null,
          scaling_factor_used_high: scalingFactorUsed,
          scaling_factor_used_low: null,
          rendered_value_high: renderedHigh,
          rendered_value_low: renderedLow,
          point_series_source_name_high: pointSeriesSourceHigh,
          point_series_source_name_low: pointSeriesSourceLow,
          point_anchor_source_name_high: pointAnchorHigh,
          point_anchor_source_name_low: pointAnchorLow,
          uses_same_source_as_previous_point_high: prev ? pointSeriesSourceHigh === (prev.periodIndex > tpIdx ? 'chartFlows.dcfProdstartPresentPerShareSeries' : (prev.periodIndex === tpIdx ? 'tpHigh prop (fallback chartFlows[0])' : 'npvHigh/tp interpolation pipeline')) : null,
          uses_same_source_as_previous_point_low: prev ? pointSeriesSourceLow === (prev.periodIndex > tpIdx ? 'chartFlows.navProdstartPerShareSeries' : (prev.periodIndex === tpIdx ? 'tpLow prop (fallback chartFlows[0])' : 'npvLow/tp interpolation pipeline')) : null,
          uses_same_source_as_tp_high: pointSeriesSourceHigh === 'tpHigh prop (fallback chartFlows[0])',
          uses_same_source_as_tp_low: pointSeriesSourceLow === 'tpLow prop (fallback chartFlows[0])',
          snapshot_or_state_identifier: projectDebug.snapshotOrStateIdentifier ?? null,
          point_uses_post_financing_shares: sharesUsed !== null && sharesUsed === projectDebug.sharesPostFinancing,
          point_uses_current_shares: sharesUsed !== null && sharesUsed === projectDebug.sharesCurrent,
          point_uses_same_financing_state_as_metric_panel: sharesUsed !== null && sharesUsed === (projectDebug.metricPanelSharesUsed ?? null),
          point_uses_same_financing_state_as_market_box: sharesUsed !== null && (sharesUsed === (projectDebug.marketBoxSharesPf ?? null) || sharesUsed === (projectDebug.marketBoxSharesCurrent ?? null)),
          point_uses_same_source_as_rendered_tp: periodIndex === tpIdx ? true : pointSeriesSourceHigh === 'tpHigh prop (fallback chartFlows[0])',
          point_uses_same_basis_as_rendered_tp: valueBasisUsed === 'tp-basis',
          notes: periodIndex > tpIdx ? null : 'Anchor/interpolation point; not from post-TP flowIndex path.',
        };
      });

    const highRows = traceRows.map((row) => ({
      series_name: 'high',
      ...row,
      per_share_value_before_render: row.per_share_value_before_render_high,
      render_formula: row.render_formula_high,
      exponent_used: row.exponent_used_high,
      scaling_factor_used: row.scaling_factor_used_high,
      rendered_value: row.rendered_value_high,
      point_series_source_name: row.point_series_source_name_high,
      point_anchor_source_name: row.point_anchor_source_name_high,
      uses_same_source_as_previous_point: row.uses_same_source_as_previous_point_high,
      uses_same_source_as_tp: row.uses_same_source_as_tp_high,
      equity_value_used: row.equity_value_used_high,
    }));

    const lowRows = traceRows.map((row) => ({
      series_name: 'low',
      ...row,
      per_share_value_before_render: row.per_share_value_before_render_low,
      render_formula: row.render_formula_low,
      exponent_used: row.exponent_used_low,
      scaling_factor_used: row.scaling_factor_used_low,
      rendered_value: row.rendered_value_low,
      point_series_source_name: row.point_series_source_name_low,
      point_anchor_source_name: row.point_anchor_source_name_low,
      uses_same_source_as_previous_point: row.uses_same_source_as_previous_point_low,
      uses_same_source_as_tp: row.uses_same_source_as_tp_low,
      equity_value_used: row.equity_value_used_low,
    }));

    return { highRows, lowRows };
  }, [projectChartModel, projectDebug]);

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
        {projectDebug?.debugEnabled && graphDebug2 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "#334155" }}>debugg fallande graf 2</summary>
            <div style={{ marginTop: 8, fontSize: 12, display: "grid", gap: 12 }}>
              <div><strong>1. High series source</strong><div>Fil/funktion: <code>src/lib/snapshot/runCorporateSnapshot.ts :: chartFlows-loop + computeLista2CfDcfMetrics</code>.</div><div>Input: <code>aggregationEffective.fcffUSD_total</code>, <code>discountRate</code>, <code>productionStartPeriod=tp</code>. Output: <code>dcfProdstartPresentPerShareSeries[flowIndex]</code> (present-value basis).</div><div>Graf efter TP i denna komponent: <code>high = dcfSeriesRaw[flowIndex] * (1+inferredRate)^flowIndex (fixad)</code>.</div></div>
              <div><strong>2. Low series source</strong><div>Fil/funktion: <code>src/lib/snapshot/runCorporateSnapshot.ts :: chartFlows-loop + computeLista2CfDcfMetrics</code>.</div><div>Output: <code>navProdstartPerShareSeries[flowIndex]</code>. I grafen efter TP används denna råserie direkt utan samma uppräkning som high.</div></div>
              <div><strong>3. Graph formula chain</strong><div>High chain: <code>chartFlows.dcfProdstartPresentPerShareSeries -&gt; flowIndex -&gt; * (1+inferredRate)^flowIndex (fixad)</code>.</div><div>Low chain: <code>chartFlows.navProdstartPerShareSeries -&gt; flowIndex -&gt; direct plot</code>.</div></div>
              <div style={{ overflowX: "auto" }}><strong>4. Period index mapping</strong><table><thead><tr><th>periodIndex</th><th>calendarYear(graf)</th><th>tp</th><th>tpOffset</th><th>flowIndex</th><th>calendarYear(series)</th><th>exponent(high)</th></tr></thead><tbody>{graphDebug2.points.map((row) => <tr key={`map2-${row.periodIndex}`}><td>{row.periodIndex}</td><td>{row.calendarYear}</td><td>{row.tp ?? "null"}</td><td>{projectChartModel.tpOffset}</td><td>{row.flowIndex}</td><td>{row.calendarFromSeries ?? "null"}</td><td>{row.exponentHigh ?? "null"}</td></tr>)}</tbody></table></div>
              <div style={{ overflowX: "auto" }}><strong>5. DCF verification</strong><table><thead><tr><th>point</th><th>source input raw</th><th>basis</th><th>graph value</th><th>correct DCF(t)</th><th>diff</th></tr></thead><tbody>{graphDebug2.focus.map((row) => <tr key={`dcf2-${row.periodIndex}`}><td>{row.flowIndex === 0 ? 'TP' : `TP+${row.flowIndex}`}</td><td>{row.sourceHighRaw ?? "null"}</td><td>present/today</td><td>{row.graphHighValue ?? "null"}</td><td>{row.correctHighValue ?? "null"}</td><td>{row.diffHigh ?? "null"}</td></tr>)}</tbody></table></div>
              <div style={{ overflowX: "auto" }}><strong>6. Difference table</strong><table><thead><tr><th>point</th><th>series</th><th>source input</th><th>basis</th><th>graph formula</th><th>graph value</th><th>correct value</th><th>diff</th></tr></thead><tbody>{graphDebug2.focus.flatMap((row) => ([<tr key={`high-${row.periodIndex}`}><td>{row.flowIndex === 0 ? 'TP' : `TP+${row.flowIndex}`}</td><td>high</td><td>{row.sourceHighRaw ?? "null"}</td><td>{row.sourceBasisHigh}</td><td>raw * (1+inferredRate)^flowIndex (fixad)</td><td>{row.graphHighValue ?? "null"}</td><td>{row.correctHighValue ?? "null"}</td><td>{row.diffHigh ?? "null"}</td></tr>, <tr key={`low-${row.periodIndex}`}><td>{row.flowIndex === 0 ? 'TP' : `TP+${row.flowIndex}`}</td><td>low</td><td>{row.sourceLowRaw ?? "null"}</td><td>{row.sourceBasisLow}</td><td>raw (ingen uppräkning)</td><td>{row.graphLowValue ?? "null"}</td><td>null</td><td>null</td></tr>]))}</tbody></table></div>
              <div style={{ overflowX: "auto" }}><strong>High exponent fix verification</strong><table><thead><tr><th>point</th><th>periodIndex</th><th>calendarYear</th><th>source input raw</th><th>source basis</th><th>current exponent used</th><th>corrected exponent</th><th>graph value before fix</th><th>graph value after fix</th><th>diff_before_vs_after</th></tr></thead><tbody>{graphDebug2.focus.map((row) => <tr key={`high-exp-fix-${row.periodIndex}`}><td>{row.flowIndex === 0 ? 'TP' : `TP+${row.flowIndex}`}</td><td>{row.periodIndex}</td><td>{row.calendarYear}</td><td>{row.sourceHighRaw ?? "null"}</td><td>{row.sourceBasisHigh}</td><td>{row.exponentHighBeforeFix ?? "null"}</td><td>{row.exponentHigh ?? "null"}</td><td>{row.graphHighValueBeforeFix ?? "null"}</td><td>{row.graphHighValue ?? "null"}</td><td>{(row.graphHighValueBeforeFix !== null && row.graphHighValue !== null) ? (row.graphHighValueBeforeFix - row.graphHighValue) : "null"}</td></tr>)}</tbody></table></div>
              <div style={{ overflowX: "auto" }}><strong>Centralkälla vs grafens nuvärden</strong><table><thead><tr><th>point</th><th>periodIndex</th><th>calendarYear</th><th>high_present_used_now</th><th>high_present_from_central_npv_source</th><th>low_present_used_now</th><th>low_present_from_central_npv_source</th><th>high_used_source_name</th><th>high_central_source_name</th><th>low_used_source_name</th><th>low_central_source_name</th><th>diff_high_present</th><th>diff_low_present</th><th>notes</th></tr></thead><tbody>{graphDebug2.centralTodayBasisRows.map((row) => <tr key={`central-vs-graph-${row.periodIndex}`}><td>{row.pointLabel}</td><td>{row.periodIndex}</td><td>{row.calendarYear}</td><td>{row.highPresentUsedNow ?? "null"}</td><td>{row.highPresentFromCentral ?? "null"}</td><td>{row.lowPresentUsedNow ?? "null"}</td><td>{row.lowPresentFromCentral ?? "null"}</td><td>{row.highUsedSourceName}</td><td>{row.highCentralSourceName}</td><td>{row.lowUsedSourceName}</td><td>{row.lowCentralSourceName}</td><td>{row.diffHighPresent ?? "null"}</td><td>{row.diffLowPresent ?? "null"}</td><td>{row.notes ?? ""}</td></tr>)}</tbody></table></div>
              <div style={{ overflowX: "auto" }}><strong>point_level_financing_trace · TABELL A: HIGH POINT TRACE</strong><table><thead><tr><th>point_name</th><th>periodIndex</th><th>flowIndex</th><th>calendarYear</th><th>shares_used</th><th>shares_source_name</th><th>debt_used</th><th>debt_source_name</th><th>cash_used</th><th>cash_source_name</th><th>enterprise_value_used</th><th>enterprise_value_source_name</th><th>equity_value_used</th><th>equity_value_source_name</th><th>value_basis_used</th><th>per_share_value_before_render</th><th>render_formula</th><th>exponent_used</th><th>scaling_factor_used</th><th>rendered_value</th><th>point_series_source_name</th><th>point_anchor_source_name</th><th>uses_shares_post_financing</th><th>uses_same_source_as_tp</th><th>notes</th></tr></thead><tbody>{pointLevelFinancingTrace?.highRows.map((row) => <tr key={`plf-high-${row.point_name}-${row.periodIndex}`}><td>{row.point_name}</td><td>{row.periodIndex}</td><td>{row.flowIndex ?? "null"}</td><td>{row.calendarYear}</td><td>{row.shares_used ?? "null"}</td><td>{row.shares_source_name}</td><td>{row.debt_used ?? "null"}</td><td>{row.debt_source_name}</td><td>{row.cash_used ?? "null"}</td><td>{row.cash_source_name}</td><td>{row.enterprise_value_used ?? "null"}</td><td>{row.enterprise_value_source_name ?? "null"}</td><td>{row.equity_value_used ?? "null"}</td><td>{row.equity_value_source_name}</td><td>{row.value_basis_used}</td><td>{row.per_share_value_before_render ?? "null"}</td><td>{row.render_formula}</td><td>{row.exponent_used ?? "null"}</td><td>{row.scaling_factor_used ?? "null"}</td><td>{row.rendered_value ?? "null"}</td><td>{row.point_series_source_name}</td><td>{row.point_anchor_source_name}</td><td>{row.uses_shares_post_financing ? "true" : "false"}</td><td>{row.uses_same_source_as_tp ? "true" : "false"}</td><td>{row.notes ?? ""}</td></tr>)}</tbody></table></div>
              <div style={{ overflowX: "auto" }}><strong>point_level_financing_trace · TABELL B: LOW POINT TRACE</strong><table><thead><tr><th>point_name</th><th>periodIndex</th><th>flowIndex</th><th>calendarYear</th><th>shares_used</th><th>shares_source_name</th><th>debt_used</th><th>debt_source_name</th><th>cash_used</th><th>cash_source_name</th><th>enterprise_value_used</th><th>enterprise_value_source_name</th><th>equity_value_used</th><th>equity_value_source_name</th><th>value_basis_used</th><th>per_share_value_before_render</th><th>render_formula</th><th>exponent_used</th><th>scaling_factor_used</th><th>rendered_value</th><th>point_series_source_name</th><th>point_anchor_source_name</th><th>uses_shares_post_financing</th><th>uses_same_source_as_tp</th><th>notes</th></tr></thead><tbody>{pointLevelFinancingTrace?.lowRows.map((row) => <tr key={`plf-low-${row.point_name}-${row.periodIndex}`}><td>{row.point_name}</td><td>{row.periodIndex}</td><td>{row.flowIndex ?? "null"}</td><td>{row.calendarYear}</td><td>{row.shares_used ?? "null"}</td><td>{row.shares_source_name}</td><td>{row.debt_used ?? "null"}</td><td>{row.debt_source_name}</td><td>{row.cash_used ?? "null"}</td><td>{row.cash_source_name}</td><td>{row.enterprise_value_used ?? "null"}</td><td>{row.enterprise_value_source_name ?? "null"}</td><td>{row.equity_value_used ?? "null"}</td><td>{row.equity_value_source_name}</td><td>{row.value_basis_used}</td><td>{row.per_share_value_before_render ?? "null"}</td><td>{row.render_formula}</td><td>{row.exponent_used ?? "null"}</td><td>{row.scaling_factor_used ?? "null"}</td><td>{row.rendered_value ?? "null"}</td><td>{row.point_series_source_name}</td><td>{row.point_anchor_source_name}</td><td>{row.uses_shares_post_financing ? "true" : "false"}</td><td>{row.uses_same_source_as_tp ? "true" : "false"}</td><td>{row.notes ?? ""}</td></tr>)}</tbody></table></div>
              <div style={{ overflowX: "auto" }}><strong>point_level_financing_trace · FLAGS</strong><table><thead><tr><th>series</th><th>point</th><th>point_uses_post_financing_shares</th><th>point_uses_current_shares</th><th>point_uses_same_financing_state_as_metric_panel</th><th>point_uses_same_financing_state_as_market_box</th><th>point_uses_same_source_as_rendered_tp</th><th>point_uses_same_basis_as_rendered_tp</th><th>uses_same_source_as_previous_point</th><th>financing_mix_summary</th><th>snapshot_or_state_identifier</th></tr></thead><tbody>{[...(pointLevelFinancingTrace?.highRows ?? []), ...(pointLevelFinancingTrace?.lowRows ?? [])].map((row) => <tr key={`plf-flag-${row.series_name}-${row.point_name}-${row.periodIndex}`}><td>{row.series_name}</td><td>{row.point_name}</td><td>{row.point_uses_post_financing_shares ? "true" : "false"}</td><td>{row.point_uses_current_shares ? "true" : "false"}</td><td>{row.point_uses_same_financing_state_as_metric_panel ? "true" : "false"}</td><td>{row.point_uses_same_financing_state_as_market_box ? "true" : "false"}</td><td>{row.point_uses_same_source_as_rendered_tp ? "true" : "false"}</td><td>{row.point_uses_same_basis_as_rendered_tp ? "true" : "false"}</td><td>{row.uses_same_source_as_previous_point === null ? "null" : (row.uses_same_source_as_previous_point ? "true" : "false")}</td><td>{row.financing_mix_summary}</td><td>{row.snapshot_or_state_identifier ?? "null"}</td></tr>)}</tbody></table></div>
              <div><strong>TP-ankare</strong><div>TP high kommer från prop <code>tpHigh</code> (list2 DCF_perShare) om finite, annars från <code>dcfSeriesRaw[0]</code> från chartFlows.</div><div>TP+1 för high går via chartFlows + uppräkning med inferredRate-pipeline.</div></div>
            </div>
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
