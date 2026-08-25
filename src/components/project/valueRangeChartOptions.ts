export const VALUE_RANGE_CHART_COLORS = {
  dcf: '#2C3E50',
  nav: '#A8C686',
  staticMultiple: '#dfb9a4',
  staticMultipleBoundary: '#dfcdb5',
  qualityMultiple: '#7C3AED',
  combinedTarget: '#be123c',
} as const;

export function buildValueRangeChartOptions(args: {
  currencyCode?: string;
  ticks: unknown[];
  yearMin: number;
  yearMax: number;
  valueWindow: { min: number; max: number };
  overlaySeries?: Record<number, Record<string, unknown>>;
}) {
  return {
    backgroundColor: '#e0e9ce', legend: { position: 'none' }, isStacked: true, areaOpacity: 0.32,
    chartArea: { left: 64, right: 56, top: 14, bottom: 30, width: '100%', height: '68%' },
    hAxis: { textStyle: { color: '#1f2937', fontSize: 11 }, gridlines: { color: 'transparent', count: 0 }, baselineColor: 'transparent', viewWindowMode: 'explicit', viewWindow: { min: args.yearMin, max: args.yearMax }, ticks: args.ticks },
    vAxis: { title: args.currencyCode ?? '', textPosition: 'none', titleTextStyle: { color: '#1f2937', italic: false }, gridlines: { color: 'transparent', count: 0 }, minorGridlines: { color: 'transparent', count: 0 }, baselineColor: 'transparent', viewWindowMode: 'explicit', viewWindow: args.valueWindow },
    tooltip: { trigger: 'focus' }, interpolateNulls: false,
    annotations: { alwaysOutside: true, textStyle: { color: '#111827', fontSize: 9 }, stem: { color: 'transparent', length: 10 } },
    // Explicit series colors below are the source of truth. Keep this palette aligned
    // so Google Charts also gets the correct defaults before per-series overrides.
    colors: ['transparent', VALUE_RANGE_CHART_COLORS.nav, VALUE_RANGE_CHART_COLORS.nav, VALUE_RANGE_CHART_COLORS.dcf, VALUE_RANGE_CHART_COLORS.combinedTarget, '#111111', '#111111', '#111111', '#111111'],
    seriesType: 'line',
    series: {
      0: { type: 'area', lineWidth: 0, pointSize: 0, visibleInLegend: false, enableInteractivity: false },
      1: { type: 'area', lineWidth: 0, pointSize: 0, visibleInLegend: false },
      // Series 2 is always the economic NAV boundary, even when NAV crosses DCF.
      // Draw NAV slightly wider underneath DCF so exact overlaps remain visible.
      2: { type: 'line', color: VALUE_RANGE_CHART_COLORS.nav, lineWidth: 1.45, pointSize: 0, visibleInLegend: false },
      // Series 3 is always the economic DCF boundary.
      3: { type: 'line', color: VALUE_RANGE_CHART_COLORS.dcf, lineWidth: 0.72, pointSize: 0, visibleInLegend: false },
      4: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      5: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      6: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      7: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      8: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      // Peak markers are intentionally visually distinct from current/start markers.
      // NAV is the larger underlay star so both peaks remain visible if they coincide;
      // the vertical reference line remains tied to the DCF peak in ValueRangeChart.
      9: { type: 'scatter', pointShape: 'star', pointSize: 15, color: VALUE_RANGE_CHART_COLORS.nav, lineWidth: 0, visibleInLegend: false },
      10: { type: 'scatter', pointShape: 'star', pointSize: 10, color: VALUE_RANGE_CHART_COLORS.dcf, lineWidth: 0, visibleInLegend: false },
      // Google Charts rejects CSS rgba() colors. This is #dc2626 blended at 25%
      // over the chart's fixed #e0e9ce background, preserving the requested look.
      11: { type: 'line', color: VALUE_RANGE_CHART_COLORS.staticMultiple, lineWidth: 0.62, pointSize: 0, visibleInLegend: false },
      // Separate boundary series allow a 15% edge without increasing the band fill.
      12: { type: 'line', color: VALUE_RANGE_CHART_COLORS.staticMultipleBoundary, lineWidth: 0.62, pointSize: 0, visibleInLegend: false, enableInteractivity: false },
      13: { type: 'line', color: VALUE_RANGE_CHART_COLORS.staticMultipleBoundary, lineWidth: 0.62, pointSize: 0, visibleInLegend: false, enableInteractivity: false },
      14: { type: 'scatter', color: VALUE_RANGE_CHART_COLORS.staticMultiple, pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      ...(args.overlaySeries ?? {}),
    },
    intervals: { style: 'area', color: '#dc2626', fillOpacity: 0.05, lineWidth: 0 },
    interval: {
      staticLow: { color: VALUE_RANGE_CHART_COLORS.staticMultiple, fillOpacity: 0.05, lineWidth: 0 },
      staticHigh: { color: VALUE_RANGE_CHART_COLORS.staticMultiple, fillOpacity: 0.05, lineWidth: 0 },
      qualityLow: { color: VALUE_RANGE_CHART_COLORS.qualityMultiple, fillOpacity: 0.05, lineWidth: 0 },
      qualityHigh: { color: VALUE_RANGE_CHART_COLORS.qualityMultiple, fillOpacity: 0.05, lineWidth: 0 },
    },
  };
}
