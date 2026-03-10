import { useMemo, useState } from 'react';
import { Chart } from 'react-google-charts';

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

type StressKey =
  | 'initialCapex2x'
  | 'spot50'
  | 'tpPlus2'
  | 'sustainingCapex15x'
  | 'opex25'
  | 'recoveryMinus10'
  | 'fxMinus10'
  | 'royalty50'
  | 'taxPlus5pp'
  | 'closure2x';

const STRESS_OPTIONS: Array<{ key: StressKey; label: string }> = [
  { key: 'initialCapex2x', label: 'Initial CAPEX x2' },
  { key: 'spot50', label: 'Råvarupris = 50% av spot' },
  { key: 'tpPlus2', label: 'TP två år senare' },
  { key: 'sustainingCapex15x', label: 'Sustaining CAPEX x1.5' },
  { key: 'opex25', label: 'Operating costs +25%' },
  { key: 'recoveryMinus10', label: 'Recovery -10%' },
  { key: 'fxMinus10', label: 'FX -10% mot target' },
  { key: 'royalty50', label: 'Royalty +50%' },
  { key: 'taxPlus5pp', label: 'Tax rate +5 pp' },
  { key: 'closure2x', label: 'Reclamation / closure cost x2' },
];

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function axisTicks(values: number[]): Array<number | { v: number; f: string }> | undefined {
  if (values.length < 1) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
  if (min === max) return [{ v: min, f: String(min.toFixed(0)) }];
  return Array.from({ length: 5 }, (_, i) => {
    const v = min + ((max - min) * i) / 4;
    const abs = Math.abs(v);
    if (abs >= 1_000_000_000) return { v, f: `${(v / 1_000_000_000).toFixed(1)}B` };
    if (abs >= 1_000_000) return { v, f: `${(v / 1_000_000).toFixed(1)}M` };
    return { v, f: `${v.toFixed(0)}` };
  });
}

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
  productionStartPeriod: number | null;
  masterN: number | null;
  marketCapToday: number | null;
  currencyCode: string;
  formatMoney: (value: number | null) => string;
  capexSeries?: Array<number | null> | null;
  taxRate?: number | null;
  debugEnabled?: boolean;
};

export default function AlltGickFelCard(props: Props) {
  const { range, yearsByPeriod, productionStartPeriod, masterN, marketCapToday, currencyCode, formatMoney, capexSeries, taxRate, debugEnabled = false } = props;
  const [active, setActive] = useState<Record<StressKey, boolean>>({} as Record<StressKey, boolean>);

  const activeKeys = STRESS_OPTIONS.filter((item) => active[item.key]).map((item) => item.key);

  const stressMeta = useMemo(() => {
    const multi = {
      spot: active.spot50 ? 0.5 : 1,
      sustaining: active.sustainingCapex15x ? 0.9 : 1,
      opex: active.opex25 ? 0.85 : 1,
      recovery: active.recoveryMinus10 ? 0.9 : 1,
      royalty: active.royalty50 ? 0.92 : 1,
      closure: active.closure2x ? 0.96 : 1,
      tax: active.taxPlus5pp ? 0.95 : 1,
      fx: active.fxMinus10 ? 0.9 : 1,
    };
    const combinedMultiplier = Object.values(multi).reduce((acc, value) => acc * value, 1);

    const initialCapex = (() => {
      if (!Array.isArray(capexSeries)) return null;
      if (typeof productionStartPeriod !== 'number' || !Number.isInteger(productionStartPeriod)) return null;
      let sum = 0;
      for (let t = 0; t < Math.max(0, productionStartPeriod); t += 1) {
        const v = finite(capexSeries[t]);
        if (v === null) return null;
        sum += Math.abs(v);
      }
      return sum;
    })();

    const tpShift = active.tpPlus2 ? 2 : 0;

    const taxRateStressed = active.taxPlus5pp
      ? Math.max(0, Math.min(1, (finite(taxRate) ?? 0) + 0.05))
      : finite(taxRate);

    const blockers: string[] = [];
    if (active.initialCapex2x && initialCapex === null) blockers.push('Initial CAPEX x2 kräver spårbar capex-serie före produktion.');
    if (active.tpPlus2 && typeof masterN === 'number' && typeof productionStartPeriod === 'number' && productionStartPeriod + 2 > masterN) {
      blockers.push(`TP+2 hamnar utanför masterN (tp=${productionStartPeriod}, masterN=${masterN}).`);
    }

    return { combinedMultiplier, initialCapex, tpShift, taxRateStressed, blockers, multi };
  }, [active, capexSeries, masterN, productionStartPeriod, taxRate]);

  const stressedRange = useMemo<NpvSpotRange>(() => {
    if (!range || stressMeta.blockers.length > 0) return null;

    const applyNode = (node: RangeNode): RangeNode => {
      const adjusted = node.npvSeries.map((value) => {
        const base = finite(value);
        if (base === null) return null;
        let next = base * stressMeta.combinedMultiplier;
        if (active.initialCapex2x && stressMeta.initialCapex !== null) {
          next -= stressMeta.initialCapex;
        }
        return next;
      });

      const shifted = stressMeta.tpShift > 0
        ? [...new Array<number | null>(stressMeta.tpShift).fill(null), ...adjusted].slice(0, adjusted.length)
        : adjusted;

      return {
        npvToday: shifted[0] ?? null,
        npvSeries: shifted,
        irr: finite(node.irr) === null ? null : (node.irr as number) * stressMeta.combinedMultiplier,
        payback: finite(node.payback) === null ? null : (node.payback as number) + stressMeta.tpShift,
        lomAvgEbitRoce: finite(node.lomAvgEbitRoce) === null ? null : (node.lomAvgEbitRoce as number) * stressMeta.combinedMultiplier,
        kapitalavkastningLom: finite(node.kapitalavkastningLom) === null ? null : (node.kapitalavkastningLom as number) * stressMeta.combinedMultiplier,
        inSitu10YUsd: finite(node.inSitu10YUsd) === null ? null : (node.inSitu10YUsd as number) * stressMeta.combinedMultiplier,
      };
    };

    return {
      low: applyNode(range.low),
      spot: applyNode(range.spot),
      high: applyNode(range.high),
    };
  }, [active.initialCapex2x, range, stressMeta]);

  const chartData = useMemo(() => {
    if (!stressedRange) return null;
    const len = Math.min(yearsByPeriod.length, stressedRange.low.npvSeries.length, stressedRange.spot.npvSeries.length, stressedRange.high.npvSeries.length);
    return [
      ['Year', 'Low', 'Band', 'Spot', 'Market Cap idag', { role: 'tooltip', type: 'string' }],
      ...Array.from({ length: len }, (_, t) => {
        const year = yearsByPeriod[t];
        const low = stressedRange.low.npvSeries[t];
        const high = stressedRange.high.npvSeries[t];
        const spot = stressedRange.spot.npvSeries[t];
        const band = finite(low) !== null && finite(high) !== null ? (high as number) - (low as number) : null;
        const mcap = t === 0 ? finite(marketCapToday) : null;
        return [year, low, band, spot, mcap, `Year ${year}\nLow: ${formatMoney(finite(low))}\nSpot: ${formatMoney(finite(spot))}\nHigh: ${formatMoney(finite(high))}`];
      }),
    ] as (string | number | null)[][];
  }, [stressedRange, yearsByPeriod, marketCapToday, formatMoney]);

  const yTicks = useMemo(() => {
    if (!stressedRange) return undefined;
    const values = [
      ...stressedRange.low.npvSeries,
      ...stressedRange.spot.npvSeries,
      ...stressedRange.high.npvSeries,
      marketCapToday,
    ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return axisTicks(values);
  }, [stressedRange, marketCapToday]);

  const metricRows: Array<[string, number | null, number | null, number | null]> = [
    ['NPV', stressedRange?.low.npvToday ?? null, stressedRange?.spot.npvToday ?? null, stressedRange?.high.npvToday ?? null],
    ['IRR', stressedRange?.low.irr ?? null, stressedRange?.spot.irr ?? null, stressedRange?.high.irr ?? null],
    ['Payback', stressedRange?.low.payback ?? null, stressedRange?.spot.payback ?? null, stressedRange?.high.payback ?? null],
    ['LOM_avg_EBIT_ROCE', stressedRange?.low.lomAvgEbitRoce ?? null, stressedRange?.spot.lomAvgEbitRoce ?? null, stressedRange?.high.lomAvgEbitRoce ?? null],
    ['Kapitalavkastning_LOM', stressedRange?.low.kapitalavkastningLom ?? null, stressedRange?.spot.kapitalavkastningLom ?? null, stressedRange?.high.kapitalavkastningLom ?? null],
    ['InSitu_10Y_USD', stressedRange?.low.inSitu10YUsd ?? null, stressedRange?.spot.inSitu10YUsd ?? null, stressedRange?.high.inSitu10YUsd ?? null],
  ];

  const debugPayload = useMemo(() => {
    if (!debugEnabled) return null;
    return JSON.stringify({
      baseInputs: { productionStartPeriod, masterN, taxRate, range },
      stressModifiers: active,
      stressedInputs: stressMeta,
      stressedKeyOutputs: stressedRange,
    }, null, 2);
  }, [active, debugEnabled, masterN, productionStartPeriod, range, stressMeta, stressedRange, taxRate]);

  return (
    <div className="producer-core-compact-card" style={{ marginTop: 8 }}>
      <section className="producer-core-section npv-range-interval-card">
        <div className="producer-core-title-row">
          <h3 className="subrub small" style={{ margin: 0 }}>Allt gick fel</h3>
        </div>
        <div className="stress-pills-row" style={{ marginTop: 8 }}>
          {STRESS_OPTIONS.map((option) => (
            <button key={option.key} type="button" className={`stress-pill ${active[option.key] ? 'is-active' : ''}`} onClick={() => setActive((prev) => ({ ...prev, [option.key]: !prev[option.key] }))}>
              {option.label}
            </button>
          ))}
        </div>
        {stressMeta.blockers.length > 0 && (
          <div className="status error" style={{ marginTop: 8 }}>
            {stressMeta.blockers.map((msg) => <div key={msg}>{msg}</div>)}
          </div>
        )}
        {stressedRange && chartData && (
          <div className="spot-range-chart-guard" style={{ marginTop: 8 }}>
            <Chart chartType="ComboChart" width="100%" height="260px" data={chartData}
              options={{ backgroundColor: '#e0e9ce', legend: { position: 'none' }, isStacked: true, chartArea: { left: 64, right: 16, top: 16, bottom: 36, width: '100%', height: '75%' }, hAxis: { format: '####' }, vAxis: { title: currencyCode, ticks: yTicks }, colors: ['transparent', '#A8C686', '#7f1d1d', '#be123c'], seriesType: 'line', areaOpacity: 0.32, series: { 0: { type: 'area', lineWidth: 0, visibleInLegend: false, enableInteractivity: false }, 1: { type: 'area', lineWidth: 0, visibleInLegend: false }, 2: { type: 'line', lineWidth: 3, pointSize: 0, visibleInLegend: false }, 3: { type: 'scatter', pointShape: 'circle', pointSize: 7, lineWidth: 0, visibleInLegend: false } } }} />
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
          <strong>Aktiva stressantaganden:</strong> {activeKeys.length > 0 ? STRESS_OPTIONS.filter((item) => active[item.key]).map((item) => item.label).join(', ') : 'Inga'}
        </div>
        {debugPayload && (
          <details style={{ marginTop: 10, borderTop: '1px dashed #94a3b8', paddingTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#334155' }}>Debug – Allt gick fel</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto', maxWidth: '100%', fontSize: 11, marginTop: 6, color: '#0f172a' }}>{debugPayload}</pre>
          </details>
        )}
      </section>
    </div>
  );
}
