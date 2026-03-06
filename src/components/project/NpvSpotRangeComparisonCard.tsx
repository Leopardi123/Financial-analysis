import { useMemo } from 'react';
import { Chart } from 'react-google-charts';

type RangeNode = {
  npvToday: number | null;
  npvSeries: Array<number | null>;
};

type NpvSpotRange = {
  low: RangeNode;
  spot: RangeNode;
  high: RangeNode;
} | null;

type Props = {
  range: NpvSpotRange;
  yearsByPeriod: number[];
  currencyCode: string;
  formatMoney: (value: number | null) => string;
};

export default function NpvSpotRangeComparisonCard({ range, yearsByPeriod, currencyCode, formatMoney }: Props) {
  const chartData = useMemo(() => {
    if (!range) return null;
    const len = Math.min(yearsByPeriod.length, range.spot.npvSeries.length, range.low.npvSeries.length, range.high.npvSeries.length);
    const rows: Array<Array<number | string | null>> = [];
    for (let t = 0; t < len; t += 1) {
      const low = range.low.npvSeries[t];
      const spot = range.spot.npvSeries[t];
      const high = range.high.npvSeries[t];
      const band = (typeof high === 'number' && Number.isFinite(high) && typeof low === 'number' && Number.isFinite(low))
        ? high - low
        : null;
      const tooltip = `Year: ${yearsByPeriod[t] ?? t}\nLow: ${formatMoney(typeof low === 'number' ? low : null)}\nSpot: ${formatMoney(typeof spot === 'number' ? spot : null)}\nHigh: ${formatMoney(typeof high === 'number' ? high : null)}`;
      rows.push([t, low, band, spot, tooltip]);
    }

    return [
      ['PeriodIndex', 'Low', 'Band', 'Base', { role: 'tooltip', type: 'string' }],
      ...rows,
    ] as (string | number | null)[][];
  }, [range, yearsByPeriod, formatMoney]);

  return (
    <div className="producer-core-compact-card" style={{ marginTop: 8 }}>
      <section className="producer-core-section npv-range-interval-card">
        <div className="producer-core-title-row">
          <h3 className="subrub small" style={{ margin: 0 }}>NPV (Spot ±25%)</h3>
          <span className="spot-context-chip">Spot idag</span>
        </div>
        {range && chartData && (
          <div className="spot-range-chart-guard" style={{ marginTop: 8 }}>
            <Chart
              chartType="ComboChart"
              width="100%"
              height="260px"
              data={chartData}
              options={{
                backgroundColor: '#e0e9ce',
                legend: { position: 'none' },
                isStacked: true,
                chartArea: { left: 64, right: 16, top: 16, bottom: 36, width: '100%', height: '75%' },
                hAxis: {
                  textPosition: 'none',
                },
                vAxis: {
                  title: currencyCode,
                  textStyle: { color: '#1f2937' },
                  titleTextStyle: { color: '#1f2937', italic: false },
                  gridlines: { color: '#cbd5e1' },
                },
                tooltip: { trigger: 'focus' },
                colors: ['transparent', '#A8C686', '#2C3E50'],
                seriesType: 'line',
                areaOpacity: 0.32,
                series: {
                  0: { type: 'area', lineWidth: 0, visibleInLegend: false, enableInteractivity: false },
                  1: { type: 'area', lineWidth: 0, visibleInLegend: false },
                  2: { type: 'line', lineWidth: 3, pointSize: 0, visibleInLegend: false },
                },
              }}
            />
          </div>
        )}
        <div className="value-interval-table" style={{ marginTop: 8 }}>
          <div className="value-interval-header">
            <span>Low</span>
            <span>Spot</span>
            <span>High</span>
          </div>
          {[
            ['NPV', range?.low.npvToday ?? null, range?.spot.npvToday ?? null, range?.high.npvToday ?? null],
            ['IRR', null, null, null],
            ['Payback', null, null, null],
            ['LOM_avg_EBIT_ROCE', null, null, null],
            ['Kapitalavkastning_LOM', null, null, null],
            ['InSitu_10Y_USD', null, null, null],
          ].map(([label, low, spot, high]) => (
            <div key={label} className="value-interval-block">
              <div className="value-interval-name">{label}</div>
              <div className="value-interval-values">
                <span>{formatMoney(low as number | null)}</span>
                <span>{formatMoney(spot as number | null)}</span>
                <span>{formatMoney(high as number | null)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
