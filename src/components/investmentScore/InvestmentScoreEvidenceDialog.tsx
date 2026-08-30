import { useEffect, useMemo, useState } from 'react';
import {
  getInvestmentScoreEvidence,
  saveInvestmentScoreEvidence,
} from '../../lib/client/investmentScoreEvidenceClient.ts';
import type {
  ManagementEvidence,
  ManagementRating,
  OptionalityEvidence,
  OptionalityRating,
} from '../../lib/investmentScore/types.ts';
import '../../styles/investment-score-evidence.css';

type Props = {
  symbol: string;
  projectId: string;
  projectName?: string | null;
  onClose: () => void;
};

type ManagementKey = keyof ManagementEvidence;
type OptionalityKey = keyof OptionalityEvidence;

const MANAGEMENT_OPTIONS: Array<{ value: ManagementRating; label: string }> = [
  { value: 'unassessed', label: 'Ej bedömd' },
  { value: 'weak', label: 'Weak' },
  { value: 'adequate', label: 'Adequate' },
  { value: 'strong', label: 'Strong' },
  { value: 'exceptional', label: 'Exceptional' },
];

const OPTIONALITY_OPTIONS: Array<{ value: OptionalityRating; label: string }> = [
  { value: 'unassessed', label: 'Ej bedömd' },
  { value: 'none', label: 'None' },
  { value: 'some', label: 'Some' },
  { value: 'strong', label: 'Strong' },
  { value: 'exceptional', label: 'Exceptional' },
];

const MANAGEMENT_ROWS: Array<{ key: ManagementKey; label: string; help: string }> = [
  {
    key: 'executionTrackRecord',
    label: 'Relevant execution track record',
    help: 'Har kärnteamet tidigare framgångsrikt genomfört i princip samma utvecklingsresa? Exceptional används för direkt jämförbar, bevisad execution.',
  },
  {
    key: 'capitalAllocation',
    label: 'Capital allocation / shareholder alignment',
    help: 'Historisk utspädning, finansiering, förvärv/försäljningar, insideralignment och värdeskapande per aktie.',
  },
  {
    key: 'deliveryCredibility',
    label: 'Delivery / credibility',
    help: 'Historik mot guidance, studier, tillstånd, CAPEX, tidplan och produktion.',
  },
  {
    key: 'technicalTeamFit',
    label: 'Technical / team fit',
    help: 'Är teamet specifikt lämpat för fyndigheten, brytningsmetoden, metallurgin och projektets komplexitet?',
  },
];

const OPTIONALITY_ROWS: Array<{ key: OptionalityKey; label: string; help: string }> = [
  {
    key: 'resourceExpansion',
    label: 'Resource expansion',
    help: 'Välunderbyggd potential att utöka resursen genom konkret geologi och borrning.',
  },
  {
    key: 'minePlanConversion',
    label: 'Mine-plan conversion',
    help: 'Identifierad mineralisering utanför nuvarande ekonomiska mine plan: inferred, resources outside reserves eller satelliter.',
  },
  {
    key: 'expansionDebottlenecking',
    label: 'Expansion / debottlenecking',
    help: 'Throughput, debottlenecking, recovery, andra pit/UG-faser eller annan expansion med attraktiv incremental CAPEX.',
  },
  {
    key: 'districtStrategic',
    label: 'District / strategic optionality',
    help: 'Flera fyndigheter, landpaket, regional konsolidering, infrastruktur eller konkreta odrillade mål.',
  },
];

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function blankManagement(): ManagementEvidence {
  return {
    executionTrackRecord: { rating: 'unassessed' },
    capitalAllocation: { rating: 'unassessed' },
    deliveryCredibility: { rating: 'unassessed' },
    technicalTeamFit: { rating: 'unassessed' },
  };
}

function blankOptionality(): OptionalityEvidence {
  return {
    resourceExpansion: { rating: 'unassessed' },
    minePlanConversion: { rating: 'unassessed' },
    expansionDebottlenecking: { rating: 'unassessed' },
    districtStrategic: { rating: 'unassessed' },
  };
}

export default function InvestmentScoreEvidenceDialog({ symbol, projectId, projectName, onClose }: Props) {
  const [management, setManagement] = useState<ManagementEvidence>(() => blankManagement());
  const [optionality, setOptionality] = useState<OptionalityEvidence>(() => blankOptionality());
  const [fatalFlaw, setFatalFlaw] = useState<boolean | null>(null);
  const [fatalFlawNote, setFatalFlawNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const title = useMemo(
    () => `${symbol} · ${projectName?.trim() || projectId}`,
    [projectId, projectName, symbol],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getInvestmentScoreEvidence(symbol, projectId)
      .then((evidence) => {
        if (cancelled) return;
        setManagement(evidence.management ?? blankManagement());
        setOptionality(evidence.optionality ?? blankOptionality());
        setFatalFlaw(evidence.fatalFlaw);
        setFatalFlawNote(evidence.fatalFlawNote ?? '');
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId, symbol]);

  function updateManagement(key: ManagementKey, field: 'rating' | 'assessmentDate' | 'note', value: string): void {
    setManagement((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value || undefined,
      },
    }));
  }

  function updateOptionality(key: OptionalityKey, field: 'rating' | 'assessmentDate' | 'note', value: string): void {
    setOptionality((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value || undefined,
      },
    }));
  }

  function stampMissingDates(): void {
    const date = todayUtc();
    setManagement((current) => Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, { ...value, assessmentDate: value.assessmentDate || date }]),
    ) as ManagementEvidence);
    setOptionality((current) => Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, { ...value, assessmentDate: value.assessmentDate || date }]),
    ) as OptionalityEvidence);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const saved = await saveInvestmentScoreEvidence({
        symbol,
        project_id: projectId,
        management,
        optionality,
        fatalFlaw,
        fatalFlawNote: fatalFlawNote.trim() || null,
      });
      setManagement(saved.management ?? management);
      setOptionality(saved.optionality ?? optionality);
      setFatalFlaw(saved.fatalFlaw);
      setFatalFlawNote(saved.fatalFlawNote ?? '');
      setInfo(`Sparad ${saved.projectUpdatedAtUtc ?? saved.companyUpdatedAtUtc ?? ''}`.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="investment-score-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="investment-score-dialog" role="dialog" aria-modal="true" aria-labelledby="investment-score-dialog-title">
        <header className="investment-score-dialog-header">
          <div>
            <h2 id="investment-score-dialog-title">Kvalitativ bedömning</h2>
            <p>{title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng">×</button>
        </header>

        {loading && <p>Laddar bedömning…</p>}
        {error && <p className="investment-score-dialog-status error">{error}</p>}
        {info && <p className="investment-score-dialog-status ok">{info}</p>}

        {!loading && (
          <>
            <div className="investment-score-dialog-note">
              Management är bolags-/team-evidence och delas av {symbol}:s projekt. Optionality och fatal flaw är projektspecifika. Popupen sparar endast evidence; score beräknas inte här.
            </div>

            <h3>Management</h3>
            {MANAGEMENT_ROWS.map((row) => {
              const value = management[row.key];
              return (
                <div className="investment-score-evidence-row" key={row.key}>
                  <div className="investment-score-evidence-label">
                    <strong>{row.label}</strong>
                    <small>{row.help}</small>
                  </div>
                  <select value={value.rating} onChange={(event) => updateManagement(row.key, 'rating', event.target.value)}>
                    {MANAGEMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input type="date" value={value.assessmentDate ?? ''} onChange={(event) => updateManagement(row.key, 'assessmentDate', event.target.value)} aria-label={`${row.label} assessment date`} />
                  <textarea rows={2} value={value.note ?? ''} onChange={(event) => updateManagement(row.key, 'note', event.target.value)} placeholder="Motivering / evidence" />
                </div>
              );
            })}

            <h3>Optionality</h3>
            {OPTIONALITY_ROWS.map((row) => {
              const value = optionality[row.key];
              return (
                <div className="investment-score-evidence-row" key={row.key}>
                  <div className="investment-score-evidence-label">
                    <strong>{row.label}</strong>
                    <small>{row.help}</small>
                  </div>
                  <select value={value.rating} onChange={(event) => updateOptionality(row.key, 'rating', event.target.value)}>
                    {OPTIONALITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <input type="date" value={value.assessmentDate ?? ''} onChange={(event) => updateOptionality(row.key, 'assessmentDate', event.target.value)} aria-label={`${row.label} assessment date`} />
                  <textarea rows={2} value={value.note ?? ''} onChange={(event) => updateOptionality(row.key, 'note', event.target.value)} placeholder="Motivering / evidence" />
                </div>
              );
            })}

            <h3>Fatal flaw veto</h3>
            <div className="investment-score-fatal-flaw">
              <label>
                <span>Status</span>
                <select value={fatalFlaw === null ? 'unassessed' : fatalFlaw ? 'yes' : 'no'} onChange={(event) => {
                  const value = event.target.value;
                  setFatalFlaw(value === 'unassessed' ? null : value === 'yes');
                }}>
                  <option value="unassessed">Ej bedömd</option>
                  <option value="no">Ingen identifierad fatal flaw</option>
                  <option value="yes">Fatal flaw identifierad</option>
                </select>
              </label>
              <label>
                <span>Motivering / evidence</span>
                <textarea rows={2} value={fatalFlawNote} onChange={(event) => setFatalFlawNote(event.target.value)} />
              </label>
            </div>

            <footer className="investment-score-dialog-actions">
              <button type="button" onClick={stampMissingDates}>Sätt dagens datum där det saknas</button>
              <button type="button" onClick={onClose}>Avbryt</button>
              <button type="button" onClick={() => void handleSave()} disabled={saving}>{saving ? 'Sparar…' : 'Spara bedömning'}</button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
