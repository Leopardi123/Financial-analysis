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
};

function formatMoney(value: number | null, currencyCode: string): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value);
}

export default function NpvSpotRangeComparisonCard({ range, yearsByPeriod, currencyCode }: Props) {
  const chartData = useMemo(() => {
    if (!range) return null;
    const len = Math.min(yearsByPeriod.length, range.base.npvSeries.length, range.low.npvSeries.length, range.high.npvSeries.length);
    const rows: Array<Array<string | number | null>> = [];
    for (let t = 0; t < len; t += 1) {
      const low = range.low.npvSeries[t];
      const base = range.base.npvSeries[t];
      const high = range.high.npvSeries[t];
      const band = (typeof high === 'number' && typeof low === 'number') ? high - low : null;
      const tooltip = `Year: ${yearsByPeriod[t] ?? t}\nLow: ${formatMoney(typeof low === 'number' ? low : null, currencyCode)}\nBase: ${formatMoney(typeof base === 'number' ? base : null, currencyCode)}\nHigh: ${formatMoney(typeof high === 'number' ? high : null, currencyCode)}`;
      rows.push([String(yearsByPeriod[t] ?? t), low, band, base, tooltip]);
    }
    return [
      ['Period', 'Low', 'Band', 'Base', { role: 'tooltip', type: 'string' }],
      ...rows,
    ] as (string | number | null)[][];
  }, [range, yearsByPeriod, currencyCode]);

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
              <span className="compact-metric-value">{formatMoney(value as number | null, currencyCode)}</span>
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
                hAxis: { slantedText: false },
                seriesType: 'line',
                colors: ['transparent', '#bfdbfe', '#0f172a'],
                areaOpacity: 0.35,
                lineWidth: 2,
                series: {
                  0: { type: 'area', lineWidth: 0, visibleInLegend: false, enableInteractivity: false },
                  1: { type: 'area', lineWidth: 0, visibleInLegend: false },
                  2: { type: 'line', lineWidth: 2, pointSize: 0 },
                },
                tooltip: { isHtml: false },
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
