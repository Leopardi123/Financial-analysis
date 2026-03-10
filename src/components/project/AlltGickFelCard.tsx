import { useMemo } from 'react';
import { Chart } from 'react-google-charts';
import type { StressOptions } from '../../lib/snapshot/applyStressModifiers';

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

const STRESS_OPTIONS: Array<{ key: keyof StressOptions; label: string }> = [
  { key: 'initialCapex2x', label: 'Initial CAPEX x2' },
  { key: 'spotHalf', label: 'Råvarupris = 50% av spot' },
  { key: 'tpPlus2', label: 'TP två år senare' },
  { key: 'sustainingCapex15', label: 'Sustaining CAPEX x1.5' },
  { key: 'opex25', label: 'Operating costs +25%' },
  { key: 'recoveryMinus10', label: 'Recovery -10%' },
  { key: 'fxMinus10', label: 'FX -10% mot target' },
  { key: 'royalty50', label: 'Royalty +50%' },
  { key: 'taxPlus5pp', label: 'Tax rate +5 pp' },
  { key: 'closure2x', label: 'Reclamation / closure cost x2' },
];

function formatMetric(label: string, value: number | null, formatMoney: (v: number | null) => string): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  if (label === 'IRR' || label === 'LOM_avg_EBIT_ROCE') return `${(value * 100).toFixed(1)}%`;
  if (label === 'Payback') return `${value.toFixed(1)} år`;
  if (label === 'Kapitalavkastning_LOM') return `${value.toFixed(2)}x`;
  return formatMoney(value);
}

type Props = {
  range: NpvSpotRange;
  yearsByPeriod: number[];
  marketCapToday: number | null;
  currencyCode: string;
  formatMoney: (value: number | null) => string;
  stressOptions: StressOptions;
  onToggle: (key: keyof StressOptions) => void;
  loading: boolean;
  error: string | null;
  edgeCases: string[];
  debugPayload?: Record<string, unknown> | null;
};

export default function AlltGickFelCard({ range, yearsByPeriod, marketCapToday, currencyCode, formatMoney, stressOptions, onToggle, loading, error, edgeCases, debugPayload = null }: Props) {
  const chartData = useMemo(() => {
    if (!range) return null;
    const len = Math.min(yearsByPeriod.length, range.low.npvSeries.length, range.spot.npvSeries.length, range.high.npvSeries.length);
    return [
      ['Year', 'Low', 'Band', 'Spot', 'Market Cap idag', { role: 'tooltip', type: 'string' }],
      ...Array.from({ length: len }, (_, t) => {
        const year = yearsByPeriod[t];
        const low = range.low.npvSeries[t];
        const high = range.high.npvSeries[t];
        const spot = range.spot.npvSeries[t];
        const band = typeof low === 'number' && typeof high === 'number' ? high - low : null;
        const mcap = t === 0 ? marketCapToday : null;
        return [year, low, band, spot, mcap, `Year ${year}\nLow: ${formatMoney(low)}\nSpot: ${formatMoney(spot)}\nHigh: ${formatMoney(high)}`];
      }),
    ] as (string | number | null)[][];
  }, [range, yearsByPeriod, marketCapToday, formatMoney]);

  const metricRows: Array<[string, number | null, number | null, number | null]> = [
    ['NPV', range?.low.npvToday ?? null, range?.spot.npvToday ?? null, range?.high.npvToday ?? null],
    ['IRR', range?.low.irr ?? null, range?.spot.irr ?? null, range?.high.irr ?? null],
    ['Payback', range?.low.payback ?? null, range?.spot.payback ?? null, range?.high.payback ?? null],
    ['LOM_avg_EBIT_ROCE', range?.low.lomAvgEbitRoce ?? null, range?.spot.lomAvgEbitRoce ?? null, range?.high.lomAvgEbitRoce ?? null],
    ['Kapitalavkastning_LOM', range?.low.kapitalavkastningLom ?? null, range?.spot.kapitalavkastningLom ?? null, range?.high.kapitalavkastningLom ?? null],
    ['InSitu_10Y_USD', range?.low.inSitu10YUsd ?? null, range?.spot.inSitu10YUsd ?? null, range?.high.inSitu10YUsd ?? null],
  ];

  const activeLabels = STRESS_OPTIONS.filter((item) => stressOptions[item.key]).map((item) => item.label);

  return (
    <div className="producer-core-compact-card" style={{ marginTop: 8 }}>
      <section className="producer-core-section npv-range-interval-card">
        <div className="producer-core-title-row">
          <h3 className="subrub small" style={{ margin: 0 }}>Allt gick fel</h3>
        </div>
        <div className="stress-pills-row" style={{ marginTop: 8 }}>
          {STRESS_OPTIONS.map((option) => (
            <button key={option.key} type="button" className={`stress-pill ${stressOptions[option.key] ? 'is-active' : ''}`} onClick={() => onToggle(option.key)}>
              {option.label}
            </button>
          ))}
        </div>
        {loading && <p className="bread" style={{ marginTop: 8 }}>Räknar stressat snapshot…</p>}
        {error && <p className="status error" style={{ marginTop: 8 }}>{error}</p>}
        {edgeCases.length > 0 && (
          <div className="status error" style={{ marginTop: 8 }}>
            {edgeCases.map((msg) => <div key={msg}>{msg}</div>)}
          </div>
        )}
        {range && chartData && !loading && !error && edgeCases.length === 0 && (
          <div className="spot-range-chart-guard" style={{ marginTop: 8 }}>
            <Chart chartType="ComboChart" width="100%" height="260px" data={chartData}
              options={{ backgroundColor: '#e0e9ce', legend: { position: 'none' }, isStacked: true, chartArea: { left: 64, right: 16, top: 16, bottom: 36, width: '100%', height: '75%' }, hAxis: { format: '####' }, vAxis: { title: currencyCode }, colors: ['transparent', '#A8C686', '#7f1d1d', '#be123c'], seriesType: 'line', areaOpacity: 0.32, series: { 0: { type: 'area', lineWidth: 0, visibleInLegend: false, enableInteractivity: false }, 1: { type: 'area', lineWidth: 0, visibleInLegend: false }, 2: { type: 'line', lineWidth: 3, pointSize: 0, visibleInLegend: false }, 3: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false } } }} />
          </div>
        )}
        <div className="value-interval-table" style={{ marginTop: 8 }}>
          <div className="value-interval-header"><span>Low</span><span>Spot</span><span>High</span></div>
          {metricRows.map(([label, low, spot, high]) => (
            <div key={label} className="value-interval-block">
              <div className="value-interval-name">{label}</div>
              <div className="value-interval-values">
                <span>{formatMetric(label, low, formatMoney)}</span>
                <span>{formatMetric(label, spot, formatMoney)}</span>
                <span>{formatMetric(label, high, formatMoney)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#334155' }}>
          <strong>Aktiva stressantaganden:</strong> {activeLabels.length > 0 ? activeLabels.join(', ') : 'Inga'}
        </div>
        {debugPayload && (
          <details style={{ marginTop: 10, borderTop: '1px dashed #94a3b8', paddingTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#334155' }}>Debug – Allt gick fel</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', maxWidth: '100%', fontSize: 11, marginTop: 6, color: '#0f172a' }}>{JSON.stringify(debugPayload, null, 2)}</pre>
          </details>
        )}
      </section>
    </div>
  );
}
