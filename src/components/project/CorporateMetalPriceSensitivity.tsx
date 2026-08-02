import { useRef, useState, type ReactNode, type UIEvent } from 'react';
import { corporateScenarioLabel, type CorporateMetalPriceMultiplier, type CorporateScenarioStatus } from '../../lib/corporate/sensitivity.ts';

export type CorporateSensitivityMetric = { id: string; label: string; focus: 'nav' | 'natural' | 'quality' | 'combined' | 'context' };
export type CorporateSensitivityColumn = {
  multiplier: CorporateMetalPriceMultiplier;
  status: CorporateScenarioStatus;
  values: Record<string, string>;
  diagnostics: string[];
  prices: Array<{ project: string; metal: string; unit: string; value: number }>;
};

export function CorporateMetalPriceSensitivity(props: {
  baseContent: ReactNode;
  survivabilityContent: ReactNode;
  columns: CorporateSensitivityColumn[];
  metrics: CorporateSensitivityMetric[];
  renderChart: (multiplier: CorporateMetalPriceMultiplier, focus: CorporateSensitivityMetric['focus']) => ReactNode;
  onSensitivityOpen?: () => void;
  onSurvivabilityOpen?: () => void;
  loading?: boolean;
  error?: string | null;
  performanceText?: string | null;
  baseDeckLabel?: string;
}) {
  const [multiplier, setMultiplier] = useState<CorporateMetalPriceMultiplier>(1);
  const [metricId, setMetricId] = useState(props.metrics[0]?.id ?? 'nav');
  const scroller = useRef<HTMLDivElement>(null);
  const selected = props.columns.find((column) => column.multiplier === multiplier);
  const metric = props.metrics.find((row) => row.id === metricId) ?? props.metrics[0];
  const [page, setPage] = useState(0);
  const go = (nextPage: number) => {
    if (nextPage === 1) props.onSensitivityOpen?.();
    if (nextPage === 2) props.onSurvivabilityOpen?.();
    scroller.current?.scrollTo({ left: nextPage * scroller.current.clientWidth, behavior: 'smooth' });
    setPage(nextPage);
  };
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    const nextPage = node.clientWidth > 0 ? Math.max(0, Math.min(2, Math.round(node.scrollLeft / node.clientWidth))) : 0;
    if (nextPage !== page) {
      setPage(nextPage);
      if (nextPage === 1) props.onSensitivityOpen?.();
      if (nextPage === 2) props.onSurvivabilityOpen?.();
    }
  };

  return <section className="corporate-finance-pages" aria-label="Corporate-värderingssidor">
    <nav className="corporate-page-nav" aria-label="Corporate analyssidor">
      <button type="button" onClick={() => go(0)} aria-current={page === 0 ? 'page' : undefined} aria-label="Visa basvärdering">1</button>
      <button type="button" onClick={() => go(1)} aria-current={page === 1 ? 'page' : undefined} aria-label="Visa metallprissensitivitet">2</button>
      <button type="button" onClick={() => go(2)} aria-current={page === 2 ? 'page' : undefined} aria-label="Visa Corporate survivability">3</button>
    </nav>
    <div className="corporate-page-scroller" ref={scroller} onScroll={onScroll}>
      <div className="corporate-finance-page" aria-label="Basvärdering">{props.baseContent}</div>
      <div className="corporate-finance-page" aria-label="Metallprissensitivitet">
        <header className="corporate-sensitivity-header">
          <div><h3>Metallprissensitivitet — Spot ±25 %</h3><p>Hela projekt- och Corporate-pipelinen körs med resolverat spotpris × vald multiplikator.</p><p>Basvärderingens prisdeck: {props.baseDeckLabel ?? 'Spot'}. Sensitivitetens 1,00 är alltid ett separat aktuellt resolverat spotdeck.</p></div>
          <button type="button" onClick={() => { setMultiplier(1); setMetricId(props.metrics[0]?.id ?? 'nav'); }}>Återställ till Spot</button>
        </header>
        <p className="sr-only" aria-live="polite">Aktivt scenario: {corporateScenarioLabel(multiplier)}. Framhävd serie: {metric?.label}.</p>
        {props.loading && <p className="status">Beräknar sju fullständiga Corporate-scenarier…</p>}
        {props.error && <p className="status error">{props.error}</p>}
        {!props.loading && <div className="corporate-sensitivity-status" data-status={selected?.status}>{corporateScenarioLabel(multiplier)} · {selected?.status ?? 'NOT_COMPUTABLE'}</div>}
        {!props.loading && selected ? props.renderChart(multiplier, metric?.focus ?? 'context') : null}
        {props.performanceText && <p className="bread">{props.performanceText}</p>}
        <div className="corporate-sensitivity-prices" aria-label="Scenario-priser">
          {selected?.prices.map((price) => <span key={`${price.project}-${price.metal}`}>{price.project}: {price.metal} {price.value.toLocaleString()} {price.unit}</span>)}
        </div>
        <div className="corporate-sensitivity-table-scroll" onWheel={(event) => event.stopPropagation()}>
          <table className="corporate-sensitivity-table"><caption>Sensitivitetsvärden per spotscenario</caption><thead><tr><th scope="col">Mått</th>{props.columns.map((column) => <th scope="col" className={column.multiplier === multiplier ? 'is-selected-column' : ''} key={column.multiplier}>{corporateScenarioLabel(column.multiplier)}</th>)}</tr></thead>
            <tbody>{props.metrics.map((row) => <tr key={row.id}><th scope="row">{row.label}</th>{props.columns.map((column) => { const pressed = column.multiplier === multiplier && row.id === metricId; return <td className={column.multiplier === multiplier ? 'is-selected-column' : ''} key={column.multiplier}><button type="button" aria-pressed={pressed} onClick={() => { setMultiplier(column.multiplier); setMetricId(row.id); }} title={column.diagnostics.join(' · ') || undefined}>{column.values[row.id] ?? 'Ej beräkningsbart'}</button></td>; })}</tr>)}</tbody>
          </table>
        </div>
        {!!selected?.diagnostics.length && <details><summary>Diagnostik</summary><ul>{selected.diagnostics.map((item) => <li key={item}>{item}</li>)}</ul></details>}
      </div>
      <div className="corporate-finance-page" aria-label="Corporate survivability">{props.survivabilityContent}</div>
    </div>
    <div className="corporate-page-indicator" aria-hidden="true"><span>1</span><span>2</span><span>3</span></div>
  </section>;
}
