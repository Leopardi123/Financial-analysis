import { useMemo, useRef } from 'react';
import { Chart } from 'react-google-charts';

type RangeNode = {
  npvToday: number | null;
  npvSeries: Array<number | null>;
};

type NpvSpotRange = {
  low: RangeNode;
  base: RangeNode;
  high: RangeNode;
} | null;

type Props = {
  range: NpvSpotRange;
  yearsByPeriod: number[];
  currencyCode: string;
  formatMoney: (value: number | null) => string;
};

export default function NpvSpotRangeComparisonCard({ range, yearsByPeriod, currencyCode, formatMoney }: Props) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const chartData = useMemo(() => {
    if (!range) return null;
    const len = Math.min(yearsByPeriod.length, range.base.npvSeries.length, range.low.npvSeries.length, range.high.npvSeries.length);
    const rows: Array<Array<number | string | null>> = [];
    for (let t = 0; t < len; t += 1) {
      const low = range.low.npvSeries[t];
      const base = range.base.npvSeries[t];
      const high = range.high.npvSeries[t];
      const band = (typeof high === 'number' && Number.isFinite(high) && typeof low === 'number' && Number.isFinite(low))
        ? high - low
        : null;
      const tooltip = `Year: ${yearsByPeriod[t] ?? t}\nLow: ${formatMoney(typeof low === 'number' ? low : null)}\nBase: ${formatMoney(typeof base === 'number' ? base : null)}\nHigh: ${formatMoney(typeof high === 'number' ? high : null)}`;
      rows.push([t, low, band, base, tooltip]);
    }

    return [
      ['PeriodIndex', 'Low', 'Band', 'Base', { role: 'tooltip', type: 'string' }],
      ...rows,
    ] as (string | number | null)[][];
  }, [range, yearsByPeriod, formatMoney]);

  return (
    <div className="producer-core-compact-card" style={{ marginTop: 8 }}>
      <section className="producer-core-section">
        <div className="producer-core-title-row">
          <h3 className="subrub small" style={{ margin: 0 }}>NPV (Spot ±25%)</h3>
        </div>
        <div className="compact-metrics-grid" style={{ marginTop: 8 }}>
          {[
            ['NPV -25%', range?.low.npvToday ?? null],
            ['NPV Base (Spot)', range?.base.npvToday ?? null],
            ['NPV +25%', range?.high.npvToday ?? null],
          ].map(([label, value]) => (
            <div key={label} className="compact-metric-row">
              <span className="compact-metric-label">{label}</span>
              <span className="compact-metric-dots" />
              <span className="compact-metric-value">{formatMoney(value as number | null)}</span>
            </div>
          ))}
        </div>
        {range && chartData && (
          <div
            className="spot-range-chart-guard"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              touchStartRef.current = { x: touch.clientX, y: touch.clientY };
            }}
            onTouchMove={(event) => {
              const start = touchStartRef.current;
              const touch = event.touches[0];
              if (!start || !touch) return;
              const dx = Math.abs(touch.clientX - start.x);
              const dy = Math.abs(touch.clientY - start.y);
              if (dx > dy && dx > 6) {
                event.preventDefault();
              }
            }}
            style={{ marginTop: 8 }}
          >
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
                vAxis: { title: currencyCode },
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
      </section>
    </div>
  );
}
