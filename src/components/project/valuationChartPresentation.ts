import {
  selectValuationChart,
  selectValuationChartDisplayRange,
  type ValuationTimeline,
} from '../../lib/valuation/canonicalValuationTimeline.ts';
import { buildValueRangeChartRow } from './valueRangeCurve.ts';

export const CHART_ORDINARY_HIGH_COLUMN = 4;
export const CHART_TODAY_HIGH_COORDINATE_COLUMN = 9;
export const CHART_TODAY_HIGH_LABEL_COLUMN = 10;

export function buildValuationChartRenderModel(args: {
  timeline: ValuationTimeline;
  scope: 'project' | 'corporate';
  startPeriods?: number[];
  priceToday: number | null;
  format: (value: number) => string;
}) {
  const selection = selectValuationChart(args.timeline, args.startPeriods);
  const displayRange = selectValuationChartDisplayRange(args.timeline, selection, args.scope);
  const rows = displayRange.points.map((period) => buildValueRangeChartRow({
    year: period.calendarYear,
    low: period.low,
    high: period.high,
    currentPrice: period.isToday ? args.priceToday : null,
    annotateCurrent: period.isToday,
    annotateProductionStart: period.isStart,
    highlightPeakLow: period.periodIndex === selection.peakLow?.periodIndex,
    highlightPeakHigh: period.periodIndex === selection.peakHigh?.periodIndex,
    peakTooltip: `År: ${period.calendarYear}`,
    format: args.format,
  }));
  const todayRowIndex = displayRange.points.findIndex((point) => point.isToday);
  const todayRow = todayRowIndex >= 0 ? rows[todayRowIndex] : null;
  return {
    selection,
    displayRange,
    rows,
    trace: {
      todayPeriod: args.timeline.todayPeriod,
      todayYear: selection.today.calendarYear,
      projectStartPeriods: args.startPeriods ?? [],
      selectedStartPeriod: selection.selectedStartPeriod,
      selectedStartState: selection.selectedStartPeriod === null ? null : args.timeline.periods[selection.selectedStartPeriod] ?? null,
      selectorTodayHigh: selection.today.high,
      todayRowHigh: todayRow?.[CHART_ORDINARY_HIGH_COLUMN] ?? null,
      renderedTodayHighCoordinate: todayRow?.[CHART_TODAY_HIGH_COORDINATE_COLUMN] ?? null,
      renderedTodayHighLabel: todayRow?.[CHART_TODAY_HIGH_LABEL_COLUMN] ?? null,
    },
  };
}
