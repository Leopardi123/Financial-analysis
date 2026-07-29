export function buildValueRangeChartOptions(args: {
  currencyCode?: string;
  ticks: unknown[];
  yearMin: number;
  yearMax: number;
  valueWindow: { min: number; max: number };
}) {
  return {
    backgroundColor: '#e0e9ce', legend: { position: 'none' }, isStacked: true, areaOpacity: 0.32,
    chartArea: { left: 64, right: 56, top: 14, bottom: 30, width: '100%', height: '68%' },
    hAxis: { textStyle: { color: '#1f2937', fontSize: 11 }, gridlines: { color: 'transparent', count: 0 }, baselineColor: 'transparent', viewWindowMode: 'explicit', viewWindow: { min: args.yearMin, max: args.yearMax }, ticks: args.ticks },
    vAxis: { title: args.currencyCode ?? '', textPosition: 'none', titleTextStyle: { color: '#1f2937', italic: false }, gridlines: { color: 'transparent', count: 0 }, minorGridlines: { color: 'transparent', count: 0 }, baselineColor: 'transparent', viewWindowMode: 'explicit', viewWindow: args.valueWindow },
    tooltip: { trigger: 'focus' }, interpolateNulls: false,
    annotations: { alwaysOutside: true, textStyle: { color: '#111827', fontSize: 9 }, stem: { color: 'transparent', length: 10 } },
    colors: ['transparent', '#A8C686', '#2C3E50', '#2C3E50', '#be123c', '#111111', '#111111', '#111111', '#111111'],
    seriesType: 'line',
    series: {
      0: { type: 'area', lineWidth: 0, pointSize: 0, visibleInLegend: false, enableInteractivity: false },
      1: { type: 'area', lineWidth: 0, pointSize: 0, visibleInLegend: false },
      2: { type: 'line', lineWidth: 0.62, pointSize: 0, visibleInLegend: false },
      3: { type: 'line', lineWidth: 0.62, pointSize: 0, visibleInLegend: false },
      4: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      5: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      6: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      7: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      8: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      9: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      10: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
      11: { type: 'line', color: 'rgba(37, 99, 235, 0.5)', lineWidth: 2, pointSize: 0, visibleInLegend: false },
    },
    intervals: { style: 'area', color: '#2563eb', fillOpacity: 0.75, lineWidth: 0 },
  };
}
