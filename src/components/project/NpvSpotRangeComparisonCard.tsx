import { useMemo } from 'react';
import { Chart } from 'react-google-charts';

const ENABLE_VALUE_INTERVAL_DEBUG = true;

type RangeNode = {
  npvToday: number | null;
  npvSeries: Array<number | null>;
  irr: number | null;
  payback: number | null;
  lomAvgEbitRoce: number | null;
  kapitalavkastningLom: number | null;
  inSitu10YUsd: number | null;
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
  debugEnabled?: boolean;
  debugPayload?: Record<string, unknown> | null;
};

function formatMetricValueByLabel(label: string, value: number | null, formatMoney: (v: number | null) => string): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  if (label === 'IRR' || label === 'LOM_avg_EBIT_ROCE') return `${(value * 100).toFixed(1)}%`;
  if (label === 'Payback') return `${value.toFixed(1)} år`;
  if (label === 'Kapitalavkastning_LOM') return `${value.toFixed(2)}x`;
  return formatMoney(value);
}

function formatCompactAxisValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    const scaled = value / 1_000_000_000;
    const rounded = Number(scaled.toFixed(1));
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    const scaled = value / 1_000_000;
    const rounded = Number(scaled.toFixed(1));
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}M`;
  }
  const rounded = Number(value.toFixed(1));
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
}

function buildCompactAxisTicks(values: number[], count = 5): Array<number | { v: number; f: string }> | undefined {
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
  if (min === max) {
    return [{ v: min, f: formatCompactAxisValue(min) }];
  }
  const ticks: Array<number | { v: number; f: string }> = [];
  for (let i = 0; i < count; i += 1) {
    const v = min + ((max - min) * i) / (count - 1);
    ticks.push({ v, f: formatCompactAxisValue(v) });
  }
  return ticks;
}

export default function NpvSpotRangeComparisonCard({
  range,
  yearsByPeriod,
  productionStartYear,
  productionStartPeriod,
  masterN,
  marketCapToday,
  currencyCode,
  formatMoney,
  debugEnabled = false,
  debugPayload = null,
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

  const yAxisTicks = useMemo(() => {
    if (!range) return undefined;
    const values = [
      ...range.low.npvSeries,
      ...range.spot.npvSeries,
      ...range.high.npvSeries,
      marketCapToday,
    ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    return buildCompactAxisTicks(values);
  }, [range, marketCapToday]);

  const metricRows = useMemo<Array<[string, number | null, number | null, number | null]>>(() => ([
    ['NPV', range?.low.npvToday ?? null, range?.spot.npvToday ?? null, range?.high.npvToday ?? null],
    ['IRR', range?.low.irr ?? null, range?.spot.irr ?? null, range?.high.irr ?? null],
    ['Payback', range?.low.payback ?? null, range?.spot.payback ?? null, range?.high.payback ?? null],
    ['LOM_avg_EBIT_ROCE', range?.low.lomAvgEbitRoce ?? null, range?.spot.lomAvgEbitRoce ?? null, range?.high.lomAvgEbitRoce ?? null],
    ['Kapitalavkastning_LOM', range?.low.kapitalavkastningLom ?? null, range?.spot.kapitalavkastningLom ?? null, range?.high.kapitalavkastningLom ?? null],
    ['InSitu_10Y_USD', range?.low.inSitu10YUsd ?? null, range?.spot.inSitu10YUsd ?? null, range?.high.inSitu10YUsd ?? null],
  ]), [range]);

  const debugText = useMemo(() => {
    if (!ENABLE_VALUE_INTERVAL_DEBUG || !debugEnabled || !debugPayload) return null;
    const scenarios: Array<{ key: 'LOW' | 'SPOT' | 'HIGH'; node: RangeNode | null }> = [
      { key: 'LOW', node: range?.low ?? null },
      { key: 'SPOT', node: range?.spot ?? null },
      { key: 'HIGH', node: range?.high ?? null },
    ];
    const guardTrace = metricRows.map(([label, low, spot, high]) => {
      const byScenario = [
        { scenario: 'LOW', value: low as number | null },
        { scenario: 'SPOT', value: spot as number | null },
        { scenario: 'HIGH', value: high as number | null },
      ].map(({ scenario, value }) => {
        const formatted = formatMetricValueByLabel(label as string, value, formatMoney);
        const isNullish = value === null || typeof value === 'undefined';
        const isFinite = typeof value === 'number' && Number.isFinite(value);
        const displayAsNA = formatted === 'n/a';
        const firstNullStage = !range
          ? 'scenarioEngine.npvSpotRange'
          : isNullish
            ? `calculator.${String(label)}.${String(scenario).toLowerCase()}`
            : (!isFinite && !isNullish)
              ? `calculator.${String(label)}.${String(scenario).toLowerCase()} (NaN/Infinity)`
              : displayAsNA
                ? `ui.format.${String(label)}.${String(scenario).toLowerCase()}`
                : 'none';
        return {
          scenario,
          raw: value,
          formatted,
          guards: {
            isNullish,
            isNumber: typeof value === 'number',
            isFinite,
            displayAsNA,
          },
          firstNullStage,
        };
      });
      return { label, byScenario };
    });

    const metricStatus = metricRows.map(([label, low, spot, high]) => {
      const entries = [
        { scenario: 'LOW', value: low as number | null },
        { scenario: 'SPOT', value: spot as number | null },
        { scenario: 'HIGH', value: high as number | null },
      ].map(({ scenario, value }) => {
        const status = value === null
          ? 'null'
          : (typeof value === 'number' && Number.isFinite(value))
            ? 'computed'
            : (typeof value === 'number' && Number.isNaN(value))
              ? 'NaN'
              : 'filtered out';
        const reason = value === null
          ? `${label} null: value missing from scenario output`
          : (typeof value === 'number' && Number.isNaN(value))
            ? `${label} null: computed NaN`
            : null;
        return { scenario, status, value, reason };
      });
      return { metric: label, entries };
    });

    const scenarioStatus = scenarios.map(({ key, node }) => {
      if (!node) return { scenario: key, success: false, reason: 'scenario node missing' };
      const prices = (debugPayload.scenarioPrices as Record<string, unknown> | null)?.[key] as Record<string, unknown> | undefined;
      const scenarioFailure = (debugPayload.scenarioFailures as Record<string, unknown> | null)?.[key];
      return {
        scenario: key,
        success: scenarioFailure == null,
        reason: scenarioFailure ?? null,
        prices: prices ?? null,
      };
    });

    return JSON.stringify({
      ...debugPayload,
      metricStatus,
      scenarioStatus,
      nullPropagation: guardTrace,
      renderLayer: {
        component: 'NpvSpotRangeComparisonCard',
        formattedWith: 'formatMetricValueByLabel',
        naRule: 'null/undefined/non-finite => n/a; 0 and negatives are valid',
      },
    }, null, 2);
  }, [debugEnabled, debugPayload, formatMoney, metricRows, range]);

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
                  textStyle: { color: '#1f2937', fontSize: 11 },
                  titleTextStyle: { color: '#1f2937', italic: false },
                  gridlines: { color: '#b8c4ad', count: 5 },
                  minorGridlines: { color: '#dbe4cf' },
                  ticks: yAxisTicks,
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
          {metricRows.map(([label, low, spot, high]) => (
            <div key={label} className="value-interval-block">
              <div className="value-interval-name">{label}</div>
              <div className="value-interval-values">
                <span>{formatMetricValueByLabel(label as string, low as number | null, formatMoney)}</span>
                <span>{formatMetricValueByLabel(label as string, spot as number | null, formatMoney)}</span>
                <span>{formatMetricValueByLabel(label as string, high as number | null, formatMoney)}</span>
              </div>
            </div>
          ))}
        </div>
        {debugText && (
          <div style={{ marginTop: 10, borderTop: '1px dashed #94a3b8', paddingTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Debug – Värdeintervall</div>
            <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', maxWidth: '100%', fontSize: 11, marginTop: 6, color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{debugText}</pre>
          </div>
        )}
      </section>
    </div>
  );
}
