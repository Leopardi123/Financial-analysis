import { useMemo, useState } from 'react';
import type { SurvivabilityFinancingMode, SurvivabilityModel, SurvivabilityScenarioId } from './corporateSurvivabilityModel.ts';
import { SURVIVABILITY_SCENARIOS } from './corporateSurvivabilityModel.ts';

const METRICS = [
  ['status', 'Status'], ['minimumCashHeadroom', 'Minimum cash headroom'], ['minimumHeadroomYear', 'År med lägst headroom'],
  ['firstNegativeFcffYear', 'Första negativa FCFF-år'], ['negativeFcffYears', 'Antal negativa FCFF-år'],
  ['firstReserveBreach', 'Första reserve breach'], ['firstFinancingYear', 'Första financing year'],
  ['largestAnnualFundingNeed', 'Största operating funding need'], ['cumulativeDebt', 'Operating debt'],
  ['cumulativeEquity', 'Operating equity'], ['newShares', 'Nya aktier för drift'], ['cumulativeDilution', 'Utspädning för drift'],
  ['stressNpv', 'Stress NPV'], ['stressNav', 'Stress NAV'],
] as const;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const format = (key: string, value: string | number | null) => value === null ? 'Ej beräkningsbart' : typeof value === 'string' ? value : key === 'cumulativeDilution' ? `${(value * 100).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %` : value.toLocaleString('sv-SE', { maximumFractionDigits: 1 });

function SurvivabilityChart({ model, selectedYear }: { model: SurvivabilityModel; selectedYear: number | null }) {
  const rows = model.rows; const width = Math.max(680, rows.length * 48); const height = 210; const pad = 34;
  const cashValues = rows.flatMap((row) => [row.closingCash, row.minimumCashReserve]).filter(finite);
  const maxAbs = Math.max(1, ...cashValues.map(Math.abs)); const y = (value: number) => height / 2 - value / maxAbs * (height / 2 - pad);
  const x = (index: number) => pad + index * ((width - pad * 2) / Math.max(1, rows.length - 1));
  const cashPoints = rows.map((row, index) => finite(row.closingCash) ? `${x(index)},${y(row.closingCash)}` : '').filter(Boolean).join(' ');
  const reservePoints = rows.map((row, index) => `${x(index)},${y(row.minimumCashReserve)}`).join(' ');
  const fundingMax = Math.max(1, ...rows.map((row) => (row.debtAdded ?? 0) + (row.equityRaised ?? 0) + (row.unfundedGap ?? 0)));
  return <div className="survivability-chart-scroll" role="group" aria-label={`Corporate cash runway för ${model.label}`}>
    <svg className="survivability-chart" viewBox={`0 0 ${width} ${height}`} aria-label="Closing cash, minimum reserve och nollinje per kalenderår">
      <line x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} className="survivability-zero" />
      {rows.map((row, index) => finite(row.closingCash) && row.closingCash < row.minimumCashReserve ? <rect key={row.period} x={x(index) - 18} width="36" y={y(row.minimumCashReserve)} height={Math.max(2, y(row.closingCash) - y(row.minimumCashReserve))} className="survivability-shortfall" /> : null)}
      <polyline points={reservePoints} className="survivability-reserve-line" /><polyline points={cashPoints} className="survivability-cash-line" />
      {rows.map((row, index) => <g key={row.period}><circle cx={x(index)} cy={finite(row.closingCash) ? y(row.closingCash) : y(0)} r={row.year === selectedYear ? 6 : 3} className="survivability-cash-point"><title>{row.year}: closing cash {format('cash', row.closingCash)}, reserve {format('reserve', row.minimumCashReserve)}</title></circle><text x={x(index)} y={height - 8} textAnchor="middle">{row.year}</text></g>)}
    </svg>
    <svg className="survivability-chart survivability-funding-chart" viewBox={`0 0 ${width} ${height}`} aria-label="Ny operating debt, operating equity och unfunded gap per kalenderår; construction-finansiering exkluderas">
      {rows.map((row, index) => { const debt = row.debtAdded ?? 0; const equity = row.equityRaised ?? 0; const gap = row.unfundedGap ?? 0; const scale = (height - 48) / fundingMax; const bx = x(index) - 12; return <g key={row.period}><rect x={bx} y={height - 28 - debt * scale} width="24" height={debt * scale} className="survivability-debt"/><rect x={bx} y={height - 28 - (debt + equity) * scale} width="24" height={equity * scale} className="survivability-equity"/><rect x={bx} y={height - 28 - (debt + equity + gap) * scale} width="24" height={gap * scale} className="survivability-gap"><title>{row.year}: debt {format('debt', debt)}, equity {format('equity', equity)}, gap {format('gap', gap)}</title></rect><text x={x(index)} y={height - 8} textAnchor="middle">{row.year}</text></g>; })}
    </svg>
    <div className="survivability-legend"><span className="cash">Closing cash</span><span className="reserve">Minimum reserve</span><span className="debt">Operating debt raised</span><span className="equity">Operating equity raised</span><span className="gap">Unfunded gap</span></div>
  </div>;
}

function FundingExplanation({ model }: { model: SurvivabilityModel }) {
  const fundingRows = model.rows.filter((row) => finite(row.totalExternalFundingNeed) && row.totalExternalFundingNeed > 0);
  if (fundingRows.length === 0) return <p className="survivability-funding-explanation"><strong>Ingen ny driftfinansiering behövs.</strong> Samtliga visade produktionsår bär reservekravet utan nya operating debt/equity-proceeds.</p>;
  const row = fundingRows.reduce((largest, candidate) => (candidate.totalExternalFundingNeed ?? 0) > (largest.totalExternalFundingNeed ?? 0) ? candidate : largest);
  const laterFundingYears = fundingRows.filter((candidate) => candidate.year !== row.year).length;
  return <p className="survivability-funding-explanation"><strong>Varför syns stapeln {row.year}?</strong> Årets operating cash efter build-CAPEX-gross-up är {format('operatingCash', row.operatingCashGenerated)}. Efter opening cash {format('openingCash', row.openingCash)} och reservekrav {format('reserve', row.minimumCashReserve)} behövs {format('funding', row.totalExternalFundingNeed)} i ny driftfinansiering: debt {format('debt', row.debtAdded)}, equity {format('equity', row.equityRaised)} och unfunded gap {format('gap', row.unfundedGap)}. Detta är ett nytt kapitaltillskott, inte ränta eller skuldstock. {laterFundingYears === 0 ? 'Övriga visade år behöver ingen ny driftfinansiering.' : `${laterFundingYears} ytterligare år behöver ny driftfinansiering.`}</p>;
}

export function CorporateSurvivabilityAnalysis(props: { models: Map<SurvivabilityScenarioId, SurvivabilityModel>; financingMode: SurvivabilityFinancingMode; onFinancingModeChange: (mode: SurvivabilityFinancingMode) => void; loading: boolean; error?: string | null; performanceText?: string | null }) {
  const [scenarioId, setScenarioId] = useState<SurvivabilityScenarioId>('base'); const [metricId, setMetricId] = useState('status'); const [drawerOpen, setDrawerOpen] = useState(false); const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const model = props.models.get(scenarioId) ?? props.models.get('base');
  const criticalRow = useMemo(() => model?.rows.find((row) => row.year === (selectedYear ?? model.criticalYear)) ?? null, [model, selectedYear]);
  const selectCell = (nextScenario: SurvivabilityScenarioId, nextMetric: string) => {
    const next = props.models.get(nextScenario); let year = next?.criticalYear ?? null;
    if (nextMetric === 'firstNegativeFcffYear' || nextMetric === 'negativeFcffYears') year = next?.metrics.firstNegativeFcffYear as number | null;
    if (nextMetric === 'firstReserveBreach') year = next?.metrics.firstReserveBreach as number | null;
    if (nextMetric === 'firstFinancingYear') year = next?.metrics.firstFinancingYear as number | null;
    if (nextMetric === 'largestAnnualFundingNeed') year = next?.rows.reduce((best, row) => (row.totalExternalFundingNeed ?? 0) > (best?.totalExternalFundingNeed ?? -1) ? row : best, null as SurvivabilityModel['rows'][number] | null)?.year ?? year;
    setScenarioId(nextScenario); setMetricId(nextMetric); setSelectedYear(year); setDrawerOpen(true);
  };
  return <section className="corporate-survivability" aria-label="Corporate survivability analysis">
    <header className="corporate-survivability-header"><div><p className="eyebrow">CORPORATE SURVIVABILITY</p><h3>Kan bolaget överleva?</h3><p>Likviditet, finansieringsbehov, utspädning och cash runway över Corporate LOM.</p></div><fieldset><legend>Finansieringsläge</legend><button type="button" aria-pressed={props.financingMode === 'dynamic'} onClick={() => props.onFinancingModeChange('dynamic')}>Dynamisk finansiering</button><button type="button" aria-pressed={props.financingMode === 'fixed'} onClick={() => props.onFinancingModeChange('fixed')}>Fast finansiering</button></fieldset></header>
    <p className="survivability-mode-help">Analysperiod: framtida produktionsår från {model?.analysisStartYear ?? 'ej fastställt'}. Historiska år och initial/build CAPEX till och med produktionsstart exkluderas från status, staplar och nyckeltal. Staplarna visar ny finansiering för drift — inte skuldstock, ränta eller amortering. {props.financingMode === 'dynamic' ? 'Driftens debt, equity och nya aktier räknas om.' : 'Basens finansiering är låst; otäckt driftbehov visas som unfunded gap.'}</p>
    {props.loading && <p className="status" aria-live="polite">Beräknar sex fulla stresscenarier; Base återanvänds…</p>}{props.error && <p className="status error">{props.error}</p>}
    {model && <><div className="corporate-sensitivity-status" data-status={model.status}>{model.label} · {model.status.replace(/_/g, ' ')}</div><SurvivabilityChart model={model} selectedYear={selectedYear}/><FundingExplanation model={model}/></>}
    {props.performanceText && <p className="bread">{props.performanceText}</p>}
    <div className="corporate-sensitivity-table-scroll"><table className="corporate-sensitivity-table survivability-table"><caption>Corporate survivability per scenario och finansieringsläge</caption><thead><tr><th scope="col">Mått</th>{SURVIVABILITY_SCENARIOS.map((scenario) => <th scope="col" key={scenario.id}>{scenario.label}</th>)}</tr></thead><tbody>{METRICS.map(([id, label]) => <tr key={id} className={metricId === id ? 'is-selected-row' : ''}><th scope="row">{label}</th>{SURVIVABILITY_SCENARIOS.map((scenario) => { const value = props.models.get(scenario.id)?.metrics[id] ?? null; return <td key={scenario.id}><button type="button" aria-pressed={scenarioId === scenario.id && metricId === id} aria-label={`${label}, ${scenario.label}: ${format(id, value)}`} onClick={() => selectCell(scenario.id, id)}>{format(id, value)}</button></td>; })}</tr>)}<tr className="is-disabled-row"><th scope="row">Produktionsstopp</th><td colSpan={7}><button type="button" disabled title="Kräver högre upplösning i produktionsmodellen.">Kräver högre upplösning i produktionsmodellen.</button></td></tr></tbody></table></div>
    {drawerOpen && criticalRow && model && <aside className="survivability-drawer" role="dialog" aria-modal="false" aria-labelledby="critical-year-title"><header><div><p className="eyebrow">CRITICAL YEAR</p><h4 id="critical-year-title">{model.label} · {criticalRow.year}</h4></div><button type="button" aria-label="Stäng critical year" onClick={() => setDrawerOpen(false)}>×</button></header><div className="survivability-drawer-grid">{[['Opening cash',criticalRow.openingCash],['Operating cash after build-CAPEX gross-up',criticalRow.operatingCashGenerated],['Initial/build CAPEX',criticalRow.constructionCapex],['Construction funding need',criticalRow.constructionFundingNeed],['Internal cash',criticalRow.internalCashUsed],['Operating debt raised',criticalRow.debtAdded],['Operating equity raised',criticalRow.equityRaised],['Unfunded gap',criticalRow.unfundedGap],['Closing cash',criticalRow.closingCash],['FCFF including CAPEX',criticalRow.fcff]].map(([label,value])=><div key={String(label)}><span>{label}</span><strong>{format(String(label), value as number|null)}</strong></div>)}</div><h5>Projektbidrag</h5><div className="survivability-projects">{Object.keys({ ...criticalRow.operatingCashGeneratedByProject, ...criticalRow.constructionCapexByProject, ...criticalRow.debtAddedByProject, ...criticalRow.equityRaisedByProject }).map((projectId)=><div key={projectId}><strong>{projectId}</strong><span>Operating cash: {format('op',criticalRow.operatingCashGeneratedByProject[projectId] ?? null)}</span><span>Initial/build CAPEX: {format('capex',criticalRow.constructionCapexByProject[projectId] ?? null)}</span><span>Total waterfall debt: {format('debt',criticalRow.debtAddedByProject[projectId] ?? 0)}</span><span>Total waterfall equity: {format('equity',criticalRow.equityRaisedByProject[projectId] ?? 0)}</span><span>Total waterfall shares: {format('shares',criticalRow.newSharesByProject[projectId] ?? 0)}</span></div>)}</div>{model.diagnostics.length > 0 && <details><summary>Diagnostik</summary><ul>{model.diagnostics.map((item,index)=><li key={`${index}-${item}`}>{item}</li>)}</ul></details>}</aside>}
  </section>;
}
