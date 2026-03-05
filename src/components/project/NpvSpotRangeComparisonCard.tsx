import { useMemo } from 'react';
import ChartCard from '../ChartCard.tsx';

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
      ['Period', 'Low', 'Band', 'Base', { role: 'tooltip', type: 'string' }],
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
          <div style={{ marginTop: 8 }}>
            <ChartCard
              title="NPV timeline (base + spot band)"
              chartType="ComboChart"
              data={chartData}
              height={260}
              options={{
                isStacked: true,
                legend: { position: 'none' },
                hAxis: {
                  slantedText: false,
                  ticks: yearsByPeriod.map((year, idx) => ({ v: idx, f: String(year) })),
                },
                seriesType: 'line',
                colors: ['transparent', '#A8C686', '#2C3E50'],
                areaOpacity: 0.32,
                series: {
                  0: { type: 'area', lineWidth: 0, visibleInLegend: false, enableInteractivity: false },
                  1: { type: 'area', lineWidth: 0, visibleInLegend: false },
                  2: { type: 'line', lineWidth: 3, pointSize: 0 },
                },
              }}
              yAxisTitle={currencyCode}
              unitLabel={currencyCode}
              unitKind="money"
            />
          </div>
        )}
      </section>
    </div>
  );
}
