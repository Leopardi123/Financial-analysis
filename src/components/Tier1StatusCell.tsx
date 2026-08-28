import { useEffect, useMemo, useState } from 'react';
import type { Tier1Gate, Tier1PreRevenueAssessment } from '../lib/tier1/preRevenue.ts';
import { TIER1_COST_BENCHMARKS } from '../lib/tier1/config.ts';

const assessmentPromiseCache = new Map<string, Promise<Tier1PreRevenueAssessment | null>>();

type CyclePriceDisplayRow = {
  metal: string;
  priceKey: string;
  unit: 'USD/toz' | 'USD/lb' | 'USD/tonne';
  spotPrice: number;
  bearPrice: number;
  multiplier: number;
  projectIds: string[];
};

type ProjectReconciliationDisplay = {
  projectId: string;
  status: 'VERIFIED' | 'NOT_VERIFIED';
  reportSourceId: string | null;
  reportPageOrTable: string | null;
  discountRate: number | null;
  npvCurrency: string | null;
  reportNpv: number | null;
  jsonNpv: number | null;
  npvRelativeDiff: number | null;
  reportIrr: number | null;
  jsonIrr: number | null;
  irrRelativeDiff: number | null;
  toleranceRelative: number;
  reportStartYear: number | null;
  reportEndYear: number | null;
  jsonStartYear: number | null;
  jsonEndYear: number | null;
  productionStartPeriod: number | null;
  reportProductionStartYear: number | null;
  jsonProductionStartYear: number | null;
  calendarShiftYears: number | null;
  reason: string;
};

type ExtendedTierSupport = Tier1PreRevenueAssessment['support'] & {
  cyclePrices?: CyclePriceDisplayRow[];
  reconciliationVerified?: boolean;
  projectReconciliation?: ProjectReconciliationDisplay[];
  preReconciliationTierStatus?: string;
};

function fetchAssessment(symbol: string): Promise<Tier1PreRevenueAssessment | null> {
  const key = symbol.trim().toUpperCase();
  const cached = assessmentPromiseCache.get(key);
  if (cached) return cached;
  const promise = fetch(`/api/tier1/pre-revenue?symbol=${encodeURIComponent(key)}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json() as { ok?: boolean; assessment?: Tier1PreRevenueAssessment };
      return payload.ok && payload.assessment ? payload.assessment : null;
    })
    .catch(() => null);
  assessmentPromiseCache.set(key, promise);
  return promise;
}

function assessmentIsProvisional(assessment: Tier1PreRevenueAssessment | null): boolean {
  if (!assessment) return false;
  const support = assessment.support as ExtendedTierSupport;
  const visibleResult = assessment.status === 'TIER_2' || assessment.status === 'TIER_3' || assessment.status === 'NOT_QUALIFIED';
  if (!visibleResult) return false;
  const reconciliationIncomplete = support.reconciliationVerified === false;
  // A structural Tier 2 can still fall to Tier 3 when cost is unknown. A
  // structural Tier 3 cannot be lowered further within the current 3-band scale.
  const costCanStillChangeResult = assessment.status === 'TIER_2' && assessment.gates.cost.status === 'NOT_VERIFIED';
  return reconciliationIncomplete || costCanStillChangeResult;
}

function overallText(assessment: Tier1PreRevenueAssessment | null): string {
  if (!assessment) return 'Ej verifierad';
  const provisional = assessmentIsProvisional(assessment) ? ' · prov.' : '';
  if (assessment.status === 'TIER_1') return 'Tier 1';
  if (assessment.status === 'TIER_2') return `Tier 2${provisional}`;
  if (assessment.status === 'TIER_3') return `Tier 3${provisional}`;
  if (assessment.status === 'NOT_QUALIFIED') return `Ej kvalificerad${provisional}`;
  return 'Ej verifierad';
}

function tierStatusText(status: string | null | undefined): string {
  if (status === 'TIER_1') return 'Tier 1';
  if (status === 'TIER_2') return 'Tier 2';
  if (status === 'TIER_3') return 'Tier 3';
  if (status === 'NOT_QUALIFIED') return 'Ej kvalificerad';
  return 'Ej verifierad';
}

function gateText(gate: Tier1Gate): string {
  if (gate.status === 'NOT_VERIFIED') return 'EJ VERIFIERAD';
  if (gate.tier === 1) return 'TIER 1';
  if (gate.tier === 2) return 'TIER 2';
  if (gate.tier === 3) return 'TIER 3';
  if (gate.status === 'FAIL') return 'EJ KVALIFICERAD';
  return 'GODKÄND';
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('sv-SE', { maximumFractionDigits: digits });
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} md USD`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MUSD`;
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} USD`;
}

function formatReportMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const unit = currency || '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} md ${unit}`.trim();
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} M ${unit}`.trim();
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} ${unit}`.trim();
}

function formatPercentFraction(value: number | null | undefined, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${(value * 100).toLocaleString('sv-SE', { maximumFractionDigits: digits })} %`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('sv-SE');
}

function formatCyclePrice(value: number, unit: CyclePriceDisplayRow['unit']): string {
  const digits = unit === 'USD/tonne' ? 0 : 2;
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: digits })} ${unit}`;
}

function formatYearSpan(start: number | null | undefined, end: number | null | undefined): string {
  if (typeof start !== 'number' || !Number.isFinite(start) || typeof end !== 'number' || !Number.isFinite(end)) return '—';
  return start === end ? String(start) : `${start}–${end}`;
}

function formatCalendarShift(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value} år`;
}

function extendedSupport(assessment: Tier1PreRevenueAssessment | null): ExtendedTierSupport | null {
  return assessment ? assessment.support as ExtendedTierSupport : null;
}

function cyclePriceRows(assessment: Tier1PreRevenueAssessment | null): CyclePriceDisplayRow[] {
  const support = extendedSupport(assessment);
  return Array.isArray(support?.cyclePrices)
    ? support.cyclePrices.filter((row) => row && typeof row.metal === 'string' && Number.isFinite(row.spotPrice) && Number.isFinite(row.bearPrice) && Number.isFinite(row.multiplier))
    : [];
}

function reconciliationRows(assessment: Tier1PreRevenueAssessment | null): ProjectReconciliationDisplay[] {
  const support = extendedSupport(assessment);
  return Array.isArray(support?.projectReconciliation) ? support.projectReconciliation : [];
}

function displayDiagnostics(items: string[]): string[] {
  const hasResolvedCuFallback = items.some((item) => /price_diagnostic metal=Cu\b/.test(item) && /derived=true\b/.test(item));
  if (!hasResolvedCuFallback) return items;
  return items.filter((item) => {
    if (item.includes('Unknown commodity provider mapping for metal=Cu')) return false;
    if (/Spot resolver failed for CU_USD_(?:LB|TONNE)/.test(item)) return false;
    return true;
  });
}

function GateRow({ label, gate }: { label: string; gate: Tier1Gate }) {
  const state = gate.status === 'NOT_VERIFIED' ? 'not-verified' : gate.status === 'FAIL' && gate.tier === null ? 'fail' : `tier-${gate.tier ?? 1}`;
  return <div className={`tier1-modal__gate tier1-modal__gate--${state}`}>
    <div className="tier1-modal__gate-head"><strong>{label}</strong><span>{gateText(gate)}</span></div>
    <div className="tier1-modal__gate-reason">{gate.reason}</div>
  </div>;
}

export default function Tier1StatusCell({ symbol }: { symbol: string }) {
  const [assessment, setAssessment] = useState<Tier1PreRevenueAssessment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void fetchAssessment(symbol).then((next) => {
      if (cancelled) return;
      setAssessment(next);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const title = useMemo(() => {
    if (!assessment) return 'Tier-bedömning kunde inte hämtas.';
    const support = assessment.support as ExtendedTierSupport;
    const reasons: string[] = [];
    if (support.reconciliationVerified === false) reasons.push('PEA/PFS/FS-avstämning saknas');
    if (assessment.status === 'TIER_2' && assessment.gates.cost.status === 'NOT_VERIFIED') reasons.push('kostnads-Tier kan fortfarande sänka klassningen');
    return reasons.length > 0 ? `Provisorisk Tier: ${reasons.join('; ')}. Klicka för detaljer.` : 'Klicka för full Tier-bedömning.';
  }, [assessment]);
  if (!loaded) return <span title="Tier-bedömning beräknas…">…</span>;

  const benchmark = assessment?.primaryMetal ? TIER1_COST_BENCHMARKS[assessment.primaryMetal] : null;
  const scaleEntries = assessment?.support.scaleEquivalentByMetal
    ? Object.entries(assessment.support.scaleEquivalentByMetal)
        .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
        .sort((a, b) => (b[1] as number) - (a[1] as number))
    : [];
  const scaleWindow = assessment?.support.scaleWindowStartYear && assessment.support.scaleWindowEndYear
    ? `${assessment.support.scaleWindowStartYear}–${assessment.support.scaleWindowEndYear}`
    : '—';
  const diagnostics = assessment ? displayDiagnostics(assessment.diagnostics) : [];
  const cyclePrices = cyclePriceRows(assessment);
  const support = extendedSupport(assessment);
  const reconciliation = reconciliationRows(assessment);

  return <>
    <button
      type="button"
      className={`tier1-status-button tier1-status-button--${assessment?.status?.toLowerCase() ?? 'not_verified'}`}
      title={title}
      onClick={() => setOpen(true)}
    >
      {overallText(assessment)}
    </button>

    {open && <div className="tier1-modal__backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="tier1-modal" role="dialog" aria-modal="true" aria-labelledby={`tier1-title-${symbol}`}>
        <div className="tier1-modal__header">
          <div>
            <div className="tier1-modal__eyebrow">TIER · PRE REVENUE</div>
            <h3 id={`tier1-title-${symbol}`}>{symbol} · {overallText(assessment)}</h3>
            <p>Tier-ekonomin räknas apples-to-apples med Instrumentbrädans gemensamma aktuella spot-deck. Rapportens PEA/PFS/FS-priser används för modellreconciliation, inte för Tier. Produktionsskala och LOM är prisoberoende.</p>
          </div>
          <button type="button" className="tier1-modal__close" onClick={() => setOpen(false)} aria-label="Stäng Tier-bedömning">×</button>
        </div>

        {!assessment ? <div className="tier1-modal__empty">Tier-bedömningen kunde inte hämtas.</div> : <>
          <div className="tier1-modal__classification">{assessment.classificationReason}</div>

          <div className="tier1-modal__summary">
            <div><span>Primär metall</span><strong>{assessment.primaryMetal ?? 'Ej verifierad'}</strong></div>
            <div><span>Revenue-andel · spot</span><strong>{typeof assessment.primaryMetalRevenueShare === 'number' ? `${(assessment.primaryMetalRevenueShare * 100).toFixed(1)} %` : '—'}</strong></div>
            <div><span>Uthållig combined scale</span><strong>{typeof assessment.support.combinedScaleEquivalent === 'number' ? `${assessment.support.combinedScaleEquivalent.toFixed(2)}x` : '—'}</strong></div>
            <div><span>Skalfönster</span><strong>{scaleWindow}</strong></div>
            <div><span>Tier-IRR · spot</span><strong>{typeof assessment.support.tierBaseIrr === 'number' ? `${(assessment.support.tierBaseIrr * 100).toFixed(1)} %` : '—'}</strong></div>
            <div><span>Kostnads-Tier</span><strong>{gateText(assessment.gates.cost)}</strong></div>
            <div><span>Spotdatum</span><strong>{formatDate(assessment.support.tierBasePriceAsOfUtc)}</strong></div>
            <div><span>Rapportavstämning</span><strong>{support?.reconciliationVerified === true ? 'Verifierad' : 'Ej verifierad'}</strong></div>
            {support?.preReconciliationTierStatus && <div><span>Beräknad Tier före rapportguard</span><strong>{tierStatusText(support.preReconciliationTierStatus)}</strong></div>}
          </div>

          <div className="tier1-modal__gates">
            <GateRow label="1. Lång livslängd" gate={assessment.gates.lom} />
            <GateRow label="2. Produktionsskala" gate={assessment.gates.scale} />
            <GateRow label="3. Låg kostnadsposition" gate={assessment.gates.cost} />
            <GateRow label="4. Cykelresistens" gate={assessment.gates.cycle} />
            <GateRow label="5. Kapitalavkastning" gate={assessment.gates.capitalReturns} />
          </div>

          {scaleEntries.length > 0 && <div className="tier1-modal__section">
            <h4>Skala · metall för metall</h4>
            <div className="tier1-modal__chips">
              {scaleEntries.map(([metal, equivalent]) => <span key={metal}><strong>{metal}</strong> {formatNumber(equivalent as number)}x</span>)}
            </div>
            <p>Skalan använder bästa sammanhängande 10-årsfönster när minst tio produktionsår finns; kortare projekt använder hela den tillgängliga produktionsperioden. 1,00x motsvarar respektive metals fysiska Tier-1-gräns. Polymetalliska bidrag summeras utan metallpris eller AuEq. Tier 2 börjar vid 0,40x och under 0,40x ger alltid högst Tier 3.</p>
          </div>}

          <div className="tier1-modal__section">
            <h4>Ekonomiskt stöd · gemensamt spot-deck</h4>
            <dl className="tier1-modal__facts">
              <div><dt>Tier NPV10 · spot</dt><dd>{formatUsd(assessment.support.tierBaseNpv10Usd)}</dd></div>
              <div><dt>NPV10 / initial CAPEX</dt><dd>{typeof assessment.support.tierBaseNpvOverInitialCapex === 'number' ? `${formatNumber(assessment.support.tierBaseNpvOverInitialCapex)}x` : '—'}</dd></div>
              <div><dt>Bear NPV10</dt><dd>{formatUsd(assessment.support.cycleNpv10Usd)}</dd></div>
              <div><dt>Bear-längd</dt><dd>{assessment.support.cycleDurationProductionPeriods} produktionsår</dd></div>
            </dl>
            {cyclePrices.length > 0 && <>
              <h4>Metallpriser i cykeltestet</h4>
              <div className="tier1-modal__chips">
                {cyclePrices.map((row) => <span key={`${row.metal}-${row.priceKey}`} title={`${row.priceKey} · projekt ${row.projectIds.join(', ')}`}>
                  <strong>{row.metal}</strong> {formatCyclePrice(row.spotPrice, row.unit)} → {formatCyclePrice(row.bearPrice, row.unit)} · {formatNumber(row.multiplier)}x
                </span>)}
              </div>
              <p>Vänster är gemensamt aktuellt spotpris. Höger är priset som faktiskt används under de första {assessment.support.cycleDurationProductionPeriods} produktionsåren i bear-testet; därefter återgår modellen till spot. Spotdatum: {formatDate(assessment.support.tierBasePriceAsOfUtc)}.</p>
            </>}
            {assessment.support.cycleMethod && <p><strong>Cykelmetod:</strong> {assessment.support.cycleMethod}</p>}
            {Object.keys(assessment.support.cycleMultipliersByMetal).length > 0 && <p><strong>Bear-multipliers:</strong> {Object.entries(assessment.support.cycleMultipliersByMetal).map(([metal, value]) => `${metal} ${formatNumber(value)}x`).join(' · ')}</p>}
          </div>

          <div className="tier1-modal__section">
            <h4>Rapportavstämning · hard guard</h4>
            {reconciliation.length === 0 ? <p><strong>Ej verifierad.</strong> Ingen reconciliation-evidens finns i project_json.</p> : <>
              <p>Rapportavstämningen verifierar att project_json återger PEA/PFS/FS-ekonomin. Kalenderåren får vara framflyttade endast som en explicit, uniform shift; antal perioder, ordning, productionStartPeriod, CAPEX/closure/WC och relativa projektfaser måste vara oförändrade. Slutlig Tier 1 kräver verifierad rapportavstämning. Tier 2/3 kan visas som provisoriska medan avstämningen återstår.</p>
              {reconciliation.map((row) => <div key={row.projectId} className="tier1-modal__gate">
                <div className="tier1-modal__gate-head"><strong>{row.projectId}</strong><span>{row.status === 'VERIFIED' ? 'VERIFIERAD' : 'EJ VERIFIERAD'}</span></div>
                <div className="tier1-modal__gate-reason">{row.reason}</div>
                {(row.reportPageOrTable || row.reportStartYear !== null || row.jsonStartYear !== null) && <dl className="tier1-modal__facts">
                  <div><dt>Rapportkälla</dt><dd>{row.reportSourceId ?? '—'}</dd></div>
                  <div><dt>Sida / tabell</dt><dd>{row.reportPageOrTable ?? '—'}</dd></div>
                  <div><dt>Rapporttimeline</dt><dd>{formatYearSpan(row.reportStartYear, row.reportEndYear)}</dd></div>
                  <div><dt>Planning timeline</dt><dd>{formatYearSpan(row.jsonStartYear, row.jsonEndYear)}</dd></div>
                  <div><dt>Kalenderförskjutning</dt><dd>{formatCalendarShift(row.calendarShiftYears)}</dd></div>
                  <div><dt>Production start · rapport → planning</dt><dd>{row.reportProductionStartYear ?? '—'} → {row.jsonProductionStartYear ?? '—'}</dd></div>
                  <div><dt>productionStartPeriod</dt><dd>{row.productionStartPeriod ?? '—'}</dd></div>
                  <div><dt>Diskonteringsränta</dt><dd>{formatPercentFraction(row.discountRate)}</dd></div>
                  <div><dt>NPV_report</dt><dd>{formatReportMoney(row.reportNpv, row.npvCurrency)}</dd></div>
                  <div><dt>NPV_json</dt><dd>{formatReportMoney(row.jsonNpv, row.npvCurrency)}</dd></div>
                  <div><dt>NPV-skillnad</dt><dd>{formatPercentFraction(row.npvRelativeDiff)}</dd></div>
                  <div><dt>IRR_report</dt><dd>{formatPercentFraction(row.reportIrr)}</dd></div>
                  <div><dt>IRR_json</dt><dd>{formatPercentFraction(row.jsonIrr)}</dd></div>
                  <div><dt>IRR-skillnad</dt><dd>{formatPercentFraction(row.irrRelativeDiff)}</dd></div>
                  <div><dt>Tolerans</dt><dd>{formatPercentFraction(row.toleranceRelative)}</dd></div>
                </dl>}
              </div>)}
            </>}
          </div>

          {benchmark && <div className="tier1-modal__section">
            <h4>Kostnadskurva · {benchmark.metal}</h4>
            <dl className="tier1-modal__facts">
              <div><dt>P25 / Q1 max</dt><dd>{formatNumber(benchmark.q1Max)} {benchmark.unit}</dd></div>
              <div><dt>P50 / median</dt><dd>{benchmark.p50Max === null ? 'Ej verifierad' : `${formatNumber(benchmark.p50Max)} ${benchmark.unit}`}</dd></div>
              <div><dt>P75</dt><dd>{benchmark.p75Max === null ? 'Ej verifierad' : `${formatNumber(benchmark.p75Max)} ${benchmark.unit}`}</dd></div>
              <div><dt>Kurvtyp</dt><dd>{benchmark.benchmarkKind === 'FULL_QUARTILE_CURVE' ? 'Full P25/P50/P75' : benchmark.benchmarkKind === 'EXACT_Q1_BOUNDARY' ? 'Exakt Q1-gräns' : 'Q1-referens · pass-only'}</dd></div>
              <div><dt>Jämförelse</dt><dd>{benchmark.comparisonEnabled ? 'Aktiverad' : 'Endast informativ'}</dd></div>
              <div><dt>Gränsosäkerhet</dt><dd>{benchmark.boundaryUncertaintyAbs > 0 ? `±${formatNumber(benchmark.boundaryUncertaintyAbs)} ${benchmark.unit}` : 'Ingen angiven'}</dd></div>
            </dl>
            <p>Cost Tier-policy: Q1 = Tier 1, Q2 = Tier 2, övre halvan (Q3/Q4) = Tier 3. Om en digitaliserad gräns har osäkerhet och projektkostnaden ligger inom osäkerhetsbandet lämnas Cost Tier Ej verifierad.</p>
            <p>{benchmark.notes}</p>
            <p><strong>Definitionsbasis:</strong> {benchmark.basisId}</p>
            <p><strong>Verifierad:</strong> {benchmark.updatedAtUtc} · <strong>dataperiod:</strong> {benchmark.dataPeriod}</p>
            <a href={benchmark.sourceUrl} target="_blank" rel="noreferrer">Källa</a>{benchmark.evidenceUrl && <> · <a href={benchmark.evidenceUrl} target="_blank" rel="noreferrer">Evidens</a></>}
          </div>}

          {diagnostics.length > 0 && <details className="tier1-modal__section tier1-modal__diagnostics">
            <summary>Teknisk diagnostik / Ej verifierat</summary>
            <ul>{diagnostics.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </details>}
        </>}
      </section>
    </div>}
  </>;
}