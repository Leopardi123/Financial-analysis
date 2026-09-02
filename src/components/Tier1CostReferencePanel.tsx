import { TIER1_COST_BENCHMARKS } from '../lib/tier1/config.ts';

export type Tier1CostPositionDisplayRow = {
  projectId: string;
  recipeId: string;
  reportSourceId: string | null;
  status: 'ASSESSED' | 'NOT_VERIFIED';
  measuredMetric: string;
  measuredCost: number | null;
  measuredCostUnit: string | null;
  costBaseYear: number | null;
  costEvidenceClass: 'ACTUAL_OPERATION' | 'FS_ESTIMATE' | 'PFS_ESTIMATE' | 'PEA_ESTIMATE' | 'OTHER_ESTIMATE' | 'UNKNOWN';
  referenceId: string;
  referenceMetric: string;
  referenceDataYear: number;
  rawReferencePosition: 'BELOW_Q1_REFERENCE' | 'Q1_TO_P50_REFERENCE' | 'P50_TO_Q3_REFERENCE' | 'ABOVE_Q3_REFERENCE' | 'UNAVAILABLE';
  comparability: 'DIRECT_REFERENCE' | 'REFERENCE_ONLY' | 'NOT_COMPARABLE';
  adjustedCost: null;
  adjustmentApplied: false;
  hardTier: null;
  reason: string;
  reference: {
    id: string;
    metric: string;
    dataYear: number;
    q1Max: number;
    p50Max: number;
    p75Max: number;
    unit: string;
    denominatorLabel: string;
    sourceRole: 'RESEARCH_ONLY' | 'ACTIVATED_BENCHMARK';
    activationAllowed: boolean;
  };
};

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('sv-SE', { maximumFractionDigits: digits });
}

function costPositionLabel(value: Tier1CostPositionDisplayRow['rawReferencePosition']): string {
  if (value === 'BELOW_Q1_REFERENCE') return 'Under Q1-referensen';
  if (value === 'Q1_TO_P50_REFERENCE') return 'Mellan Q1 och P50';
  if (value === 'P50_TO_Q3_REFERENCE') return 'Mellan P50 och P75';
  if (value === 'ABOVE_Q3_REFERENCE') return 'Över P75';
  return 'Ej jämförbar';
}

function costComparabilityLabel(value: Tier1CostPositionDisplayRow['comparability']): string {
  if (value === 'DIRECT_REFERENCE') return 'Direkt referens';
  if (value === 'REFERENCE_ONLY') return 'Endast referens';
  return 'Ej jämförbar';
}

function costEvidenceLabel(value: Tier1CostPositionDisplayRow['costEvidenceClass']): string {
  if (value === 'ACTUAL_OPERATION') return 'Actual operation';
  if (value === 'FS_ESTIMATE') return 'FS-estimat';
  if (value === 'PFS_ESTIMATE') return 'PFS-estimat';
  if (value === 'PEA_ESTIMATE') return 'PEA-estimat';
  if (value === 'OTHER_ESTIMATE') return 'Annat estimat';
  return 'Okänd';
}

export default function Tier1CostReferencePanel({
  rows,
  primaryMetal,
  hardCostGateVerified,
}: {
  rows: Tier1CostPositionDisplayRow[];
  primaryMetal: string | null | undefined;
  hardCostGateVerified: boolean;
}) {
  // Compatibility prop retained while Cost Quartile is inactive. Its value is
  // deliberately ignored for Tier semantics.
  void hardCostGateVerified;

  const benchmark = primaryMetal && primaryMetal in TIER1_COST_BENCHMARKS
    ? TIER1_COST_BENCHMARKS[primaryMetal as keyof typeof TIER1_COST_BENCHMARKS]
    : null;

  return <>
    {rows.length > 0 && <div className="tier1-modal__section">
      <h4>Kostnadsposition · diagnostik</h4>
      <p><strong>N/A i Tier-motorn.</strong> Projektkostnaden och referenspositionen bevaras endast som diagnostik/evidens. De får inte blockera, höja, sänka eller göra Tier-resultatet provisoriskt. Projektkostnaden behåller sin verifierade definition och sitt eget kostnadsår; ingen CPI-, FX- eller annan vintage-rebasing görs.</p>
      {rows.map((row) => <article key={`${row.projectId}-${row.recipeId}`} className="tier1-cost-card">
        <div className="tier1-modal__gate-head"><strong>{row.projectId}</strong><span>{costComparabilityLabel(row.comparability).toUpperCase()}</span></div>
        <div className="tier1-cost-card__headline">
          <div><span>Projektkostnad</span><strong>{row.measuredCost === null ? 'Ej verifierad' : `${formatNumber(row.measuredCost, 4)} ${row.measuredCostUnit ?? ''}`}</strong></div>
          <div><span>Referensposition · utan rebasing</span><strong>{costPositionLabel(row.rawReferencePosition)}</strong></div>
          <div><span>Tier-påverkan</span><strong>N/A</strong></div>
        </div>
        <details>
          <summary>Teknisk kostnadsdiagnostik</summary>
          <dl className="tier1-modal__facts">
            <div><dt>Source-locked recipe</dt><dd>{row.recipeId}</dd></div>
            <div><dt>Projektmetric</dt><dd>{row.measuredMetric}</dd></div>
            <div><dt>Cost base year</dt><dd>{row.costBaseYear ?? 'Ej verifierad'}</dd></div>
            <div><dt>Evidensklass</dt><dd>{costEvidenceLabel(row.costEvidenceClass)}</dd></div>
            <div><dt>Jämförbarhet</dt><dd>{costComparabilityLabel(row.comparability)}</dd></div>
            <div><dt>Referens</dt><dd>{row.referenceDataYear} · {row.reference.denominatorLabel}</dd></div>
            <div><dt>Referensmetric</dt><dd>{row.referenceMetric}</dd></div>
            <div><dt>Q1 / P50 / P75</dt><dd>{`${formatNumber(row.reference.q1Max, 3)} / ${formatNumber(row.reference.p50Max, 3)} / ${formatNumber(row.reference.p75Max, 3)} ${row.reference.unit}`}</dd></div>
          </dl>
          <div className="tier1-modal__gate-reason">{row.reason}</div>
        </details>
      </article>)}
    </div>}

    {benchmark && <div className="tier1-modal__section">
      <h4>Extern kostnadsreferens · S&amp;P · {benchmark.metal}</h4>
      <div className="tier1-reference-card">
        <p className="tier1-reference-card__status"><strong>Kurvreferens:</strong> {benchmark.comparisonEnabled ? 'Tillgänglig för diagnostisk read-off' : 'Ej tillgänglig'} · <strong>Tier-gate:</strong> N/A (avaktiverad).</p>
        <dl className="tier1-modal__facts">
          <div><dt>P25 / Q1 max</dt><dd>{benchmark.q1Max === null ? 'Ej verifierad' : `${formatNumber(benchmark.q1Max)} ${benchmark.unit}`}</dd></div>
          <div><dt>P50 / median</dt><dd>{benchmark.p50Max === null ? 'Ej verifierad' : `${formatNumber(benchmark.p50Max)} ${benchmark.unit}`}</dd></div>
          <div><dt>P75</dt><dd>{benchmark.p75Max === null ? 'Ej verifierad' : `${formatNumber(benchmark.p75Max)} ${benchmark.unit}`}</dd></div>
          <div><dt>Kurvtyp</dt><dd>{benchmark.benchmarkKind === 'FULL_QUARTILE_CURVE' ? 'Full P25/P50/P75' : benchmark.benchmarkKind === 'EXACT_Q1_BOUNDARY' ? 'Exakt Q1-gräns' : benchmark.benchmarkKind === 'CURVE_IDENTIFIED_NO_BOUNDARIES' ? 'Kurva identifierad · gränser saknas' : 'Q1-referens · pass-only'}</dd></div>
          <div><dt>Digitiseringsosäkerhet</dt><dd>{benchmark.boundaryUncertaintyAbs > 0 ? `±${formatNumber(benchmark.boundaryUncertaintyAbs)} ${benchmark.unit}` : 'Ingen angiven'}</dd></div>
        </dl>
        <p className="tier1-reference-separation-note"><strong>Separat researchkurva:</strong> Instrumentbrädans publika 2024 contained-Cu-kurva är research-only och blandas inte med denna S&amp;P paid/payable-Cu-referens.</p>
        <details>
          <summary>S&amp;P-källa och metod</summary>
          <p>{benchmark.notes}</p>
          <p><strong>Benchmarkbasis:</strong> {benchmark.basisId}</p>
          <p><strong>Dataperiod:</strong> {benchmark.dataPeriod}{benchmark.sourcePageOrTable ? ` · ${benchmark.sourcePageOrTable}` : ''}</p>
          <a href={benchmark.sourceUrl} target="_blank" rel="noreferrer">Källa</a>{benchmark.evidenceUrl && <> · <a href={benchmark.evidenceUrl} target="_blank" rel="noreferrer">Evidens</a></>}
        </details>
      </div>
    </div>}
  </>;
}
