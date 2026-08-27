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

function statusText(status: 'PASS' | 'FAIL' | 'NOT_VERIFIED'): string {
  if (status === 'PASS') return 'PASS';
  if (status === 'FAIL') return 'FAIL';
  return 'EJ VERIFIERAD';
}

function overallText(assessment: Tier1PreRevenueAssessment | null): string {
  if (!assessment) return 'Ej verifierad';
  if (assessment.status === 'TIER_1') return 'Tier 1';
  if (assessment.status === 'NOT_TIER_1') return 'Ej Tier 1';
  return 'Ej verifierad';
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

function GateRow({ label, gate }: { label: string; gate: Tier1Gate }) {
  return <div className={`tier1-modal__gate tier1-modal__gate--${gate.status.toLowerCase()}`}>
    <div className="tier1-modal__gate-head"><strong>{label}</strong><span>{statusText(gate.status)}</span></div>
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

  const title = useMemo(() => assessment
    ? 'Klicka för full Tier-1-bedömning.'
    : 'Tier-1-bedömning kunde inte hämtas.', [assessment]);

  if (!loaded) return <span title="Tier-1-bedömning beräknas…">…</span>;

  const benchmark = assessment?.primaryMetal ? TIER1_COST_BENCHMARKS[assessment.primaryMetal] : null;
  const scaleEntries = assessment?.support.scaleEquivalentByMetal
    ? Object.entries(assessment.support.scaleEquivalentByMetal)
        .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
        .sort((a, b) => (b[1] as number) - (a[1] as number))
    : [];

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
            <div className="tier1-modal__eyebrow">TIER-1 · PRE REVENUE</div>
            <h3 id={`tier1-title-${symbol}`}>{symbol} · {overallText(assessment)}</h3>
            <p>Hård bedömning: samtliga fem kategorier måste vara PASS. Saknad verifierbar data ger Ej verifierad, aldrig ett antaget värde.</p>
          </div>
          <button type="button" className="tier1-modal__close" onClick={() => setOpen(false)} aria-label="Stäng Tier-1-bedömning">×</button>
        </div>

        {!assessment ? <div className="tier1-modal__empty">Tier-1-bedömningen kunde inte hämtas.</div> : <>
          <div className="tier1-modal__summary">
            <div><span>Primär metall</span><strong>{assessment.primaryMetal ?? 'Ej verifierad'}</strong></div>
            <div><span>Revenue-andel</span><strong>{typeof assessment.primaryMetalRevenueShare === 'number' ? `${(assessment.primaryMetalRevenueShare * 100).toFixed(1)} %` : '—'}</strong></div>
            <div><span>Combined scale</span><strong>{typeof assessment.support.combinedScaleEquivalent === 'number' ? `${assessment.support.combinedScaleEquivalent.toFixed(2)}x` : '—'}</strong></div>
            <div><span>Report/base IRR</span><strong>{typeof assessment.support.reportBaseIrr === 'number' ? `${(assessment.support.reportBaseIrr * 100).toFixed(1)} %` : '—'}</strong></div>
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
            <p>1.00x motsvarar respektive metals fysiska Tier-1-gräns. Polymetalliska bidrag summeras utan metallpris eller spot-AuEq.</p>
          </div>}

          <div className="tier1-modal__section">
            <h4>Ekonomiskt stöd</h4>
            <dl className="tier1-modal__facts">
              <div><dt>Base NPV10</dt><dd>{formatUsd(assessment.support.reportBaseNpv10Usd)}</dd></div>
              <div><dt>NPV10 / initial CAPEX</dt><dd>{typeof assessment.support.reportBaseNpvOverInitialCapex === 'number' ? `${formatNumber(assessment.support.reportBaseNpvOverInitialCapex)}x` : '—'}</dd></div>
              <div><dt>Bear NPV10</dt><dd>{formatUsd(assessment.support.cycleNpv10Usd)}</dd></div>
              <div><dt>Bear-längd</dt><dd>{assessment.support.cycleDurationProductionPeriods} produktionsperioder</dd></div>
            </dl>
            {assessment.support.cycleMethod && <p><strong>Cykelmetod:</strong> {assessment.support.cycleMethod}</p>}
            {Object.keys(assessment.support.cycleMultipliersByMetal).length > 0 && <p><strong>Bear-multipliers:</strong> {Object.entries(assessment.support.cycleMultipliersByMetal).map(([metal, value]) => `${metal} ${formatNumber(value)}x`).join(' · ')}</p>}
          </div>

          {benchmark && <div className="tier1-modal__section">
            <h4>Statisk kostnadsreferens · {benchmark.metal}</h4>
            <p><strong>{benchmark.q1Max} {benchmark.unit}</strong> · {benchmark.metric} · {benchmark.benchmarkKind === 'EXACT_Q1_BOUNDARY' ? 'exakt publicerad Q1-gräns' : 'konservativ Q1-referens'}</p>
            <p>{benchmark.notes}</p>
            <p><strong>Verifierad i registret:</strong> {benchmark.updatedAtUtc} · <strong>dataperiod:</strong> {benchmark.dataPeriod}</p>
            <a href={benchmark.sourceUrl} target="_blank" rel="noreferrer">Källa</a>{benchmark.evidenceUrl && <> · <a href={benchmark.evidenceUrl} target="_blank" rel="noreferrer">Q1-evidens</a></>}
          </div>}

          {assessment.diagnostics.length > 0 && <div className="tier1-modal__section tier1-modal__diagnostics">
            <h4>Diagnostik / Ej verifierat</h4>
            <ul>{assessment.diagnostics.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </div>}
        </>}
      </section>
    </div>}
  </>;
}
