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
  productionStartYear: number | null;
  productionStartPeriod: number | null;
  masterN: number | null;
  marketCapToday: number | null;
  currencyCode: string;
  formatMoney: (value: number | null) => string;
};

export default function NpvSpotRangeComparisonCard({
  range,
  yearsByPeriod,
  productionStartYear,
  productionStartPeriod,
  masterN,
  marketCapToday,
  currencyCode,
  formatMoney,
}: Props) {
  const axisYears = useMemo(() => {
    if (
      typeof productionStartYear === 'number'
      && Number.isFinite(productionStartYear)
      && typeof productionStartPeriod === 'number'
      && Number.isFinite(productionStartPeriod)
      && typeof masterN === 'number'
      && Number.isFinite(masterN)
      && masterN >= 0
    ) {
      return Array.from({ length: masterN + 1 }, (_, t) => productionStartYear + (t - productionStartPeriod));
    }
    return yearsByPeriod;
  }, [masterN, productionStartPeriod, productionStartYear, yearsByPeriod]);

  const chartData = useMemo(() => {
    if (!range) return null;
    const len = Math.min(axisYears.length, range.spot.npvSeries.length, range.low.npvSeries.length, range.high.npvSeries.length);
    const rows: Array<Array<number | string | null>> = [];
    for (let t = 0; t < len; t += 1) {
      const year = axisYears[t];
      if (typeof year !== 'number' || !Number.isFinite(year)) continue;
      const low = range.low.npvSeries[t];
      const spot = range.spot.npvSeries[t];
      const high = range.high.npvSeries[t];
      const band = (typeof high === 'number' && Number.isFinite(high) && typeof low === 'number' && Number.isFinite(low))
        ? high - low
        : null;
      const marketCapHere = t === 0 && typeof marketCapToday === 'number' && Number.isFinite(marketCapToday) ? marketCapToday : null;
      const tooltip = `Year: ${year}\nHigh: ${formatMoney(typeof high === 'number' ? high : null)}\nSpot: ${formatMoney(typeof spot === 'number' ? spot : null)}\nLow: ${formatMoney(typeof low === 'number' ? low : null)}${marketCapHere === null ? '' : `\nMarket Cap idag: ${formatMoney(marketCapHere)}`}`;
      rows.push([year, low, band, spot, marketCapHere, tooltip]);
    }

    return [
      ['Year', 'Low', 'Band', 'Base', 'Market Cap idag', { role: 'tooltip', type: 'string' }],
      ...rows,
    ] as (string | number | null)[][];
  }, [range, axisYears, marketCapToday, formatMoney]);

  return (
    <div className="producer-core-compact-card" style={{ marginTop: 8 }}>
      <section className="producer-core-section npv-range-interval-card">
        <div className="producer-core-title-row">
          <h3 className="subrub small" style={{ margin: 0 }}>NPV (Spot ±25%)</h3>
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
                  format: '####',
                  textStyle: { color: '#1f2937', fontSize: 11 },
                  gridlines: { color: '#dbe4cf' },
                },
                vAxis: {
                  title: currencyCode,
                  textStyle: { color: '#1f2937' },
                  titleTextStyle: { color: '#1f2937', italic: false },
                  gridlines: { color: '#b8c4ad', count: 5 },
                  minorGridlines: { color: '#dbe4cf' },
                },
                tooltip: { trigger: 'focus' },
                colors: ['transparent', '#A8C686', '#2C3E50', '#be123c'],
                seriesType: 'line',
                areaOpacity: 0.32,
                series: {
                  0: { type: 'area', lineWidth: 0, visibleInLegend: false, enableInteractivity: false },
                  1: { type: 'area', lineWidth: 0, visibleInLegend: false },
                  2: { type: 'line', lineWidth: 3, pointSize: 0, visibleInLegend: false },
                  3: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false },
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
