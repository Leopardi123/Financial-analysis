import { useEffect, useMemo, useState } from 'react';
import type { ProducerIntervalEconomics } from '../lib/miningProducer/intervalEconomics.ts';
import type { ProducerPeerRow, ProducerPeerTable } from '../lib/miningProducer/peerTable.ts';
import '../styles/producerCompareReadability.css';

type NumericRange = { low: number; high: number };

type Props = {
  table: ProducerPeerTable;
  intervalEconomicsByCompanyId: Record<string, {
    attributable: ProducerIntervalEconomics;
    financial: ProducerIntervalEconomics;
  }>;
};

function rangeFromScalar(value: number | null): NumericRange | null {
  return value === null || !Number.isFinite(value) ? null : { low: value, high: value };
}

function positiveRatioRange(numerator: NumericRange | null, denominator: NumericRange | null): NumericRange | null {
  if (!numerator || !denominator || numerator.low < 0 || denominator.low <= 0 || denominator.high <= 0) return null;
  return {
    low: numerator.low / denominator.high,
    high: numerator.high / denominator.low,
  };
}

function valuePerRange(value: number | null, denominator: NumericRange | null): NumericRange | null {
  if (value === null || !Number.isFinite(value) || !denominator || denominator.low <= 0 || denominator.high <= 0) return null;
  return { low: value / denominator.high, high: value / denominator.low };
}

function formatPctRange(value: NumericRange | null): string {
  if (!value) return 'Ej beräkningsbart';
  const low = value.low * 100;
  const high = value.high * 100;
  return Math.abs(low - high) < 0.05 ? `${low.toFixed(0)} %` : `${low.toFixed(0)}–${high.toFixed(0)} %`;
}

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)} md`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)} M`;
  return `$${value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}`;
}

function formatUsdRange(value: NumericRange | null): string {
  if (!value) return 'Ej beräkningsbart';
  return value.low === value.high ? formatUsd(value.low) : `${formatUsd(value.low)}–${formatUsd(value.high)}`;
}

function formatUsdPerOzRange(value: NumericRange | null): string {
  if (!value) return 'Ej beräkningsbart';
  const low = `$${value.low.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}/oz`;
  const high = `$${value.high.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}/oz`;
  return value.low === value.high ? low : `${low}–${high}`;
}

function canonicalRevenueRange(row: ProducerPeerRow, props: Props): NumericRange | null {
  return props.intervalEconomicsByCompanyId[row.companyId]?.financial.revenueUSD.range
    ?? rangeFromScalar(row.revenueUSD);
}

function canonicalAuRange(row: ProducerPeerRow, props: Props): NumericRange | null {
  return props.intervalEconomicsByCompanyId[row.companyId]?.attributable.auOz.range
    ?? rangeFromScalar(row.auOz);
}

function RelativeBar({
  label,
  comparedName,
  benchmarkName,
  comparedRatio,
}: {
  label: string;
  comparedName: string;
  benchmarkName: string;
  comparedRatio: NumericRange | null;
}) {
  const maxRatio = comparedRatio ? Math.max(1, comparedRatio.high, 1.1) : 1.1;
  const benchmarkWidth = `${100 / maxRatio}%`;
  const lowWidth = comparedRatio ? `${Math.max(0, Math.min(100, comparedRatio.low / maxRatio * 100))}%` : '0%';
  const highWidth = comparedRatio ? `${Math.max(0, Math.min(100, comparedRatio.high / maxRatio * 100))}%` : '0%';

  return (
    <div className="producer-relative__metric">
      <div className="producer-relative__metric-head">
        <strong>{label}</strong>
        <span>{formatPctRange(comparedRatio)}</span>
      </div>
      <div className="producer-relative__bar-row">
        <span title={comparedName}>{comparedName}</span>
        <div className="producer-relative__track">
          {comparedRatio && <div className="producer-relative__bar producer-relative__bar--compared" style={{ width: highWidth }} />}
          {comparedRatio && comparedRatio.low !== comparedRatio.high && (
            <div className="producer-relative__range-floor" style={{ width: lowWidth }} />
          )}
        </div>
        <b>{formatPctRange(comparedRatio)}</b>
      </div>
      <div className="producer-relative__bar-row producer-relative__bar-row--benchmark">
        <span title={benchmarkName}>{benchmarkName}</span>
        <div className="producer-relative__track">
          <div className="producer-relative__bar producer-relative__bar--benchmark" style={{ width: benchmarkWidth }} />
        </div>
        <b>100 %</b>
      </div>
    </div>
  );
}

export default function ProducerRelativeComparison(props: Props) {
  const rows = props.table.rows;
  const [comparedId, setComparedId] = useState(rows[0]?.companyId ?? '');
  const [benchmarkId, setBenchmarkId] = useState(rows[1]?.companyId ?? rows[0]?.companyId ?? '');

  useEffect(() => {
    if (rows.length === 0) return;
    if (!rows.some((row) => row.companyId === comparedId)) setComparedId(rows[0].companyId);
    if (!rows.some((row) => row.companyId === benchmarkId) || benchmarkId === comparedId) {
      setBenchmarkId(rows.find((row) => row.companyId !== comparedId)?.companyId ?? rows[0].companyId);
    }
  }, [rows, comparedId, benchmarkId]);

  const compared = rows.find((row) => row.companyId === comparedId) ?? null;
  const benchmark = rows.find((row) => row.companyId === benchmarkId) ?? null;

  const metrics = useMemo(() => {
    if (!compared || !benchmark || compared.companyId === benchmark.companyId) return null;
    const comparedRevenue = canonicalRevenueRange(compared, props);
    const benchmarkRevenue = canonicalRevenueRange(benchmark, props);
    const revenueRatio = positiveRatioRange(comparedRevenue, benchmarkRevenue);

    const comparedMcap = rangeFromScalar(compared.marketCapUSD);
    const benchmarkMcap = rangeFromScalar(benchmark.marketCapUSD);
    const mcapRatio = positiveRatioRange(comparedMcap, benchmarkMcap);

    const comparedAu = canonicalAuRange(compared, props);
    const benchmarkAu = canonicalAuRange(benchmark, props);
    const comparedMcapPerAu = valuePerRange(compared.marketCapUSD, comparedAu);
    const benchmarkMcapPerAu = valuePerRange(benchmark.marketCapUSD, benchmarkAu);
    const mcapPerAuRatio = positiveRatioRange(comparedMcapPerAu, benchmarkMcapPerAu);

    return {
      comparedRevenue,
      benchmarkRevenue,
      revenueRatio,
      mcapRatio,
      comparedMcapPerAu,
      benchmarkMcapPerAu,
      mcapPerAuRatio,
    };
  }, [compared, benchmark, props]);

  if (rows.length < 2) return null;

  return (
    <section className="producer-relative">
      <div className="producer-relative__header">
        <div>
          <strong>RELATIV SKALA OCH VÄRDERING · {props.table.selectedYear}</strong>
          <small>Benchmark = 100. Endast kanoniska revenue- och attributable Au-värden används i grafiken.</small>
        </div>
        <div className="producer-relative__selectors">
          <label>
            <span>JÄMFÖR</span>
            <select value={comparedId} onChange={(event) => setComparedId(event.target.value)}>
              {rows.map((row) => <option key={row.companyId} value={row.companyId}>{row.companyName}</option>)}
            </select>
          </label>
          <label>
            <span>MOT</span>
            <select value={benchmarkId} onChange={(event) => setBenchmarkId(event.target.value)}>
              {rows.filter((row) => row.companyId !== comparedId).map((row) => (
                <option key={row.companyId} value={row.companyId}>{row.companyName}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {compared && benchmark && metrics && (
        <>
          <div className="producer-relative__grid">
            <RelativeBar
              label="Revenue-genererande skala"
              comparedName={compared.companyName}
              benchmarkName={benchmark.companyName}
              comparedRatio={metrics.revenueRatio}
            />
            <RelativeBar
              label="Börsvärde"
              comparedName={compared.companyName}
              benchmarkName={benchmark.companyName}
              comparedRatio={metrics.mcapRatio}
            />
            <RelativeBar
              label="Värdering / attributable oz"
              comparedName={compared.companyName}
              benchmarkName={benchmark.companyName}
              comparedRatio={metrics.mcapPerAuRatio}
            />
          </div>

          <div className="producer-relative__absolute">
            <div>
              <span>Revenue {props.table.selectedYear} · JÄMFÖRD</span>
              <b>{compared.companyName} · {formatUsdRange(metrics.comparedRevenue)}</b>
              <small>BENCHMARK · {benchmark.companyName} · {formatUsdRange(metrics.benchmarkRevenue)}</small>
            </div>
            <div>
              <span>MCap / attributable Au · JÄMFÖRD</span>
              <b>{compared.companyName} · {formatUsdPerOzRange(metrics.comparedMcapPerAu)}</b>
              <small>BENCHMARK · {benchmark.companyName} · {formatUsdPerOzRange(metrics.benchmarkMcapPerAu)}</small>
            </div>
          </div>

          <div className="producer-relative__text">
            {metrics.revenueRatio && metrics.mcapRatio ? (
              <p><strong>{compared.companyName}</strong> når cirka {formatPctRange(metrics.revenueRatio)} av {benchmark.companyName}s revenue-genererande skala {props.table.selectedYear}, men motsvarar cirka {formatPctRange(metrics.mcapRatio)} av dess nuvarande börsvärde.</p>
            ) : (
              <p>Canonical revenue eller market cap saknas för en fullständig relativ storleksjämförelse.</p>
            )}
            {metrics.mcapPerAuRatio && metrics.comparedMcapPerAu && metrics.benchmarkMcapPerAu && (
              <p>Per attributable {props.table.selectedYear}-ounce betalar marknaden {formatUsdPerOzRange(metrics.comparedMcapPerAu)} för {compared.companyName} jämfört med {formatUsdPerOzRange(metrics.benchmarkMcapPerAu)} för {benchmark.companyName}. Den relativa värderingen per framtida ounce är därmed cirka <strong>{formatPctRange(metrics.mcapPerAuRatio)}</strong>.</p>
            )}
            <p>Detta är inte i sig ett undervärderingsbevis. Skillnaden kan spegla projekt-, land-, finansierings-, ramp-up- och kostnadsrisk, men en stor diskrepans motiverar vidare analys av EBITDA, FCFF och risk.</p>
          </div>
        </>
      )}
    </section>
  );
}
