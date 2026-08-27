import { useEffect, useMemo, useState } from 'react';
import type { Tier1Gate, Tier1PreRevenueAssessment } from '../lib/tier1/preRevenue.ts';
import { TIER1_COST_BENCHMARKS } from '../lib/tier1/config.ts';

const assessmentPromiseCache = new Map<string, Promise<Tier1PreRevenueAssessment | null>>();

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

function overallText(assessment: Tier1PreRevenueAssessment | null): string {
  if (!assessment) return 'Ej verifierad';
  if (assessment.status === 'TIER_1') return 'Tier 1';
  if (assessment.status === 'TIER_2') return 'Tier 2';
  if (assessment.status === 'TIER_3') return 'Tier 3';
  if (assessment.status === 'NOT_QUALIFIED') return 'Ej kvalificerad';
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

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('sv-SE');
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

  const title = useMemo(() => assessment ? 'Klicka för full Tier-bedömning.' : 'Tier-bedömning kunde inte hämtas.', [assessment]);
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
            <div><span>Spotdatum</span><strong>{formatDate(assessment.support.tierBasePriceAsOfUtc)}</strong></div>
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
            {assessment.support.cycleMethod && <p><strong>Cykelmetod:</strong> {assessment.support.cycleMethod}</p>}
            {Object.keys(assessment.support.cycleMultipliersByMetal).length > 0 && <p><strong>Bear-multipliers:</strong> {Object.entries(assessment.support.cycleMultipliersByMetal).map(([metal, value]) => `${metal} ${formatNumber(value)}x`).join(' · ')}</p>}
          </div>

          {benchmark && <div className="tier1-modal__section">
            <h4>Statisk kostnadsreferens · {benchmark.metal}</h4>
            <p><strong>{benchmark.q1Max} {benchmark.unit}</strong> · {benchmark.benchmarkKind === 'EXACT_Q1_BOUNDARY' ? 'publicerad Q1-gräns' : 'konservativ Q1-referens'}</p>
            <p>{benchmark.notes}</p>
            <p><strong>Verifierad:</strong> {benchmark.updatedAtUtc} · <strong>dataperiod:</strong> {benchmark.dataPeriod}</p>
            <a href={benchmark.sourceUrl} target="_blank" rel="noreferrer">Källa</a>{benchmark.evidenceUrl && <> · <a href={benchmark.evidenceUrl} target="_blank" rel="noreferrer">Q1-evidens</a></>}
          </div>}

          {assessment.diagnostics.length > 0 && <details className="tier1-modal__section tier1-modal__diagnostics">
            <summary>Teknisk diagnostik / Ej verifierat</summary>
            <ul>{assessment.diagnostics.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </details>}
        </>}
      </section>
    </div>}
  </>;
}