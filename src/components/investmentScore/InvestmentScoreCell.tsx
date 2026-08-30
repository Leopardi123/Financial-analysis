import { useEffect, useMemo, useState } from 'react';
import type { CorporateSnapshot } from '../../lib/corporate/snapshot/types.ts';
import { getInvestmentScoreEvidence } from '../../lib/client/investmentScoreEvidenceClient.ts';
import { adaptCanonicalPreRevenueToInvestmentScore } from '../../lib/investmentScore/canonicalPreRevenueAdapter.ts';
import { computeInvestmentScore } from '../../lib/investmentScore/engine.ts';
import { computeProvisionalRawScoreV0, type ProvisionalRawScoreResult } from '../../lib/investmentScore/rawScore.ts';
import type {
  InvestmentScoreInputs,
  InvestmentScoreResult,
  ManagementEvidence,
  OptionalityEvidence,
  ScoreGateResult,
} from '../../lib/investmentScore/types.ts';
import type { Tier1PreRevenueAssessment } from '../../lib/tier1/preRevenue.ts';
import '../../styles/investment-score-cell.css';

type SnapshotWithValuationSeries = CorporateSnapshot & Record<string, unknown> & {
  corporateValuationTimeSeries?: { rows?: Array<{ year?: number; evEbitda6xPerShare?: number | null }> };
};

type TierResponse = { ok?: boolean; assessment?: Tier1PreRevenueAssessment };

type Props = {
  symbol: string;
  projectIds: string[];
  snapshot: SnapshotWithValuationSeries | null;
  priceCurrentTargetCurrency: number | null;
  manualExtraShares: number;
};

type LoadedAssessment = {
  result: InvestmentScoreResult | null;
  inputs: InvestmentScoreInputs | null;
  raw: ProvisionalRawScoreResult | null;
  management: ManagementEvidence | null;
  optionality: OptionalityEvidence | null;
  fatalFlawNote: string | null;
  diagnostics: string[];
};

const LABELS: Record<number, string> = {
  1: 'Generational',
  2: 'Exceptional Buy',
  3: 'Strong Buy',
  4: 'Buy',
  5: 'Hold',
  6: 'Neutral',
  7: 'Unattractive',
  8: 'Poor',
  9: 'Avoid',
  10: 'Broken / Extreme',
};

const MANAGEMENT_LABELS: Array<[keyof ManagementEvidence, string]> = [
  ['executionTrackRecord', 'Relevant execution track record'],
  ['capitalAllocation', 'Capital allocation / shareholder alignment'],
  ['deliveryCredibility', 'Delivery / credibility'],
  ['technicalTeamFit', 'Technical / team fit'],
];

const OPTIONALITY_LABELS: Array<[keyof OptionalityEvidence, string]> = [
  ['resourceExpansion', 'Resource expansion'],
  ['minePlanConversion', 'Mine-plan conversion'],
  ['expansionDebottlenecking', 'Expansion / debottlenecking'],
  ['districtStrategic', 'District / strategic optionality'],
];

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('sv-SE', { maximumFractionDigits: digits });
}

function formatMultiple(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${formatNumber(value)}x` : '—';
}

function passText(value: boolean | null | undefined): string {
  if (value === true) return 'PASS';
  if (value === false) return 'FAIL';
  return 'EJ VERIFIERAD';
}

function gateState(gate: ScoreGateResult): string {
  if (gate.passed) return 'pass';
  if (gate.checks.some((check) => check.passed === null)) return 'not-verified';
  return 'fail';
}

function GateSection({ gate }: { gate: ScoreGateResult }) {
  const state = gateState(gate);
  return <div className={`investment-score-modal__gate investment-score-modal__gate--${state}`}>
    <div className="investment-score-modal__gate-head">
      <strong>Score {gate.score}</strong>
      <span>{state === 'pass' ? 'PASS' : state === 'not-verified' ? 'EJ VERIFIERAD' : 'FAIL'}</span>
    </div>
    <div className="investment-score-modal__checks">
      {gate.checks.map((check) => <div key={`${gate.score}-${check.key}`} className="investment-score-modal__check">
        <span>{check.label}</span>
        <strong>{passText(check.passed)}</strong>
        <small>
          {check.observed !== undefined ? `Utfall: ${String(check.observed ?? '—')}` : ''}
          {check.threshold !== undefined ? ` · Krav: ${String(check.threshold ?? '—')}` : ''}
        </small>
        {check.reason && <small>{check.reason}</small>}
      </div>)}
    </div>
  </div>;
}

function ManagementEvidenceList({ evidence }: { evidence: ManagementEvidence | null }) {
  if (!evidence) return <p className="investment-score-modal__muted">Ej bedömd.</p>;
  return <div className="investment-score-modal__evidence-list">
    {MANAGEMENT_LABELS.map(([key, label]) => {
      const item = evidence[key];
      return <div key={key} className="investment-score-modal__evidence-row">
        <div><strong>{label}</strong><small>{item.assessmentDate || 'Datum saknas'}</small></div>
        <span>{item.rating}</span>
        {item.note && <p>{item.note}</p>}
      </div>;
    })}
  </div>;
}

function OptionalityEvidenceList({ evidence }: { evidence: OptionalityEvidence | null }) {
  if (!evidence) return <p className="investment-score-modal__muted">Ej bedömd.</p>;
  return <div className="investment-score-modal__evidence-list">
    {OPTIONALITY_LABELS.map(([key, label]) => {
      const item = evidence[key];
      return <div key={key} className="investment-score-modal__evidence-row">
        <div><strong>{label}</strong><small>{item.assessmentDate || 'Datum saknas'}</small></div>
        <span>{item.rating}</span>
        {item.note && <p>{item.note}</p>}
      </div>;
    })}
  </div>;
}

export default function InvestmentScoreCell({
  symbol,
  projectIds,
  snapshot,
  priceCurrentTargetCurrency,
  manualExtraShares,
}: Props) {
  const [assessment, setAssessment] = useState<LoadedAssessment>({
    result: null,
    inputs: null,
    raw: null,
    management: null,
    optionality: null,
    fatalFlawNote: null,
    diagnostics: [],
  });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setAssessment({ result: null, inputs: null, raw: null, management: null, optionality: null, fatalFlawNote: null, diagnostics: [] });
      try {
        if (projectIds.length !== 1) {
          if (alive) setAssessment((current) => ({
            ...current,
            diagnostics: ['Ej verifierad: Investment Score v0 saknar ännu kanonisk optionality/fatal-flaw-aggregation för flerprojektbolag.'],
          }));
          return;
        }

        const projectId = projectIds[0];
        const [tierRes, evidence] = await Promise.all([
          fetch(`/api/tier1/pre-revenue?symbol=${encodeURIComponent(symbol)}`),
          getInvestmentScoreEvidence(symbol, projectId),
        ]);
        const tierBody = await tierRes.json() as TierResponse;
        const tierAssessment = tierRes.ok && tierBody.ok === true ? tierBody.assessment ?? null : null;

        const adapted = adaptCanonicalPreRevenueToInvestmentScore({
          snapshot,
          tierAssessment,
          priceCurrentTargetCurrency,
          manualExtraShares,
          management: evidence.management,
          optionality: evidence.optionality,
          fatalFlaw: evidence.fatalFlaw,
        });
        const raw = computeProvisionalRawScoreV0(adapted.inputs);
        const scored = computeInvestmentScore({ ...adapted.inputs, rawScore: raw.rawScore });
        if (alive) {
          setAssessment({
            result: scored,
            inputs: { ...adapted.inputs, rawScore: raw.rawScore },
            raw,
            management: evidence.management,
            optionality: evidence.optionality,
            fatalFlawNote: evidence.fatalFlawNote,
            diagnostics: [...adapted.diagnostics, ...raw.diagnostics, ...scored.diagnostics],
          });
        }
      } catch (error) {
        if (alive) setAssessment((current) => ({
          ...current,
          diagnostics: [`Ej verifierad: ${error instanceof Error ? error.message : String(error)}`],
        }));
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [symbol, projectIds.join('|'), snapshot, priceCurrentTargetCurrency, manualExtraShares]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const title = useMemo(() => assessment.diagnostics.join('\n'), [assessment.diagnostics]);
  const result = assessment.result;
  const inputs = assessment.inputs;
  const raw = assessment.raw;
  const score = result?.investmentScore ?? null;
  const cellText = loading ? '…' : score === null ? 'Ej verifierad' : String(score);
  const cellSub = !loading && score !== null ? `${LABELS[score] ?? ''}${result?.verified ? '' : ' · prelim.'}` : '';

  return <>
    <button
      type="button"
      className={`investment-score-cell investment-score-button ${score !== null ? `investment-score-cell--score-${score}` : 'investment-score-cell--unverified'}`}
      title={title || 'Klicka för Investment Score-bedömning.'}
      onClick={() => setOpen(true)}
      disabled={loading}
    >
      <strong>{cellText}</strong>
      {cellSub && <small>{cellSub}</small>}
    </button>

    {open && <div className="tier1-modal__backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <section className="tier1-modal investment-score-modal" role="dialog" aria-modal="true" aria-labelledby={`investment-score-title-${symbol}`}>
        <div className="tier1-modal__header">
          <div>
            <div className="tier1-modal__eyebrow">INVESTMENT SCORE · PRE REVENUE</div>
            <h3 id={`investment-score-title-${symbol}`}>{symbol} · {score === null ? 'Ej verifierad' : `${score} · ${LABELS[score] ?? ''}`}</h3>
            <p>Investment Score sammanväger projektkvalitet, dagens värdering, reratingpotential och management. Optionality kan endast förbättra score. Score 1–3 begränsas dessutom av hårda gates.</p>
          </div>
          <button type="button" className="tier1-modal__close" onClick={() => setOpen(false)} aria-label="Stäng Investment Score-bedömning">×</button>
        </div>

        <div className="tier1-modal__summary investment-score-modal__summary">
          <div><span>Slutscore</span><strong>{score ?? 'Ej verifierad'}</strong></div>
          <div><span>Raw score</span><strong>{formatNumber(result?.rawScore, 2)}</strong></div>
          <div><span>Bästa tillåtna</span><strong>{result?.bestAllowedScore ?? '—'}</strong></div>
          <div><span>Verifiering</span><strong>{result?.verified ? 'Verifierad' : 'Ej verifierad'}</strong></div>
          <div><span>Tier</span><strong>{inputs?.tier ?? '—'}</strong></div>
          <div><span>LOM</span><strong>{typeof inputs?.lomYears === 'number' ? `${formatNumber(inputs.lomYears, 0)} år` : '—'}</strong></div>
          <div><span>P/NAV PF</span><strong>{formatMultiple(inputs?.pNav)}</strong></div>
          <div><span>Peak 6x / pris</span><strong>{formatMultiple(inputs?.peak6xVsPrice)}</strong></div>
          <div><span>Valuation convergence</span><strong>{inputs?.valuationConvergence ?? '—'}</strong></div>
          <div><span>Cykelresistens</span><strong>{passText(inputs?.cycleResistanceTier1Pass)}</strong></div>
          <div><span>Downside robustness</span><strong>{passText(inputs?.downsideRobustnessPass)}</strong></div>
          <div><span>Fatal flaw</span><strong>{inputs?.fatalFlaw === false ? 'Nej' : inputs?.fatalFlaw === true ? 'Ja' : 'Ej verifierad'}</strong></div>
        </div>

        {raw && <div className="tier1-modal__section">
          <h4>Continuous score · v0 calibration</h4>
          <dl className="tier1-modal__facts">
            <div><dt>Asset quality · 30 %</dt><dd>{formatNumber(raw.components.assetQuality, 2)}</dd></div>
            <div><dt>Valuation · 30 %</dt><dd>{formatNumber(raw.components.valuation, 2)}</dd></div>
            <div><dt>Rerating · 25 %</dt><dd>{formatNumber(raw.components.rerating, 2)}</dd></div>
            <div><dt>Management · 15 %</dt><dd>{formatNumber(raw.components.management, 2)}</dd></div>
            <div><dt>Optionality bonus</dt><dd>{formatNumber(raw.components.optionalityAdjustment, 2)}</dd></div>
          </dl>
          <p className="investment-score-modal__muted">Vikter och breakpoints är preliminära och ska kalibreras mot riktiga project JSON.</p>
        </div>}

        {result && <div className="tier1-modal__section">
          <h4>Hårda gates</h4>
          <div className="investment-score-modal__gates">
            <GateSection gate={result.gates.score1} />
            <GateSection gate={result.gates.score2} />
            <GateSection gate={result.gates.score3} />
          </div>
        </div>}

        <div className="tier1-modal__section">
          <h4>Management evidence</h4>
          <ManagementEvidenceList evidence={assessment.management} />
        </div>

        <div className="tier1-modal__section">
          <h4>Optionality evidence</h4>
          <OptionalityEvidenceList evidence={assessment.optionality} />
        </div>

        {assessment.fatalFlawNote && <div className="tier1-modal__section">
          <h4>Fatal flaw · kommentar</h4>
          <p>{assessment.fatalFlawNote}</p>
        </div>}

        <div className="tier1-modal__section tier1-modal__diagnostics">
          <details>
            <summary>Diagnostik ({assessment.diagnostics.length})</summary>
            {assessment.diagnostics.length > 0 ? <ul>{assessment.diagnostics.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>Ingen diagnostik.</p>}
          </details>
        </div>
      </section>
    </div>}
  </>;
}
