import { useEffect, useMemo, useState } from 'react';
import type { Tier1Gate, Tier1PreRevenueAssessment } from '../lib/tier1/preRevenue.ts';
import { TIER1_COST_BENCHMARKS } from '../lib/tier1/config.ts';
import Tier1CostReferencePanel from './Tier1CostReferencePanel.tsx';
import '../styles/tier1-diagnostic-hierarchy.css';

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

type ScaleProductDisplayRow = {
  product: string;
  averageAnnualQuantity: number;
  inputUnit: string;
  normalizedQuantity: number | null;
  normalizedUnit: 'toz' | 'lb' | 'tonne' | null;
  threshold: number | null;
  thresholdUnit: 'toz' | 'lb' | 'tonne' | null;
  equivalent: number | null;
  scored: boolean;
  reason: string;
};

type CostPositionDisplayRow = {
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

type ExtendedTierSupport = Tier1PreRevenueAssessment['support'] & {
  cyclePrices?: CyclePriceDisplayRow[];
  costMethod?: string;
  costProjectDetails?: string[];
  costPositionEvidence?: CostPositionDisplayRow[];
  scaleProducts?: Record<string, ScaleProductDisplayRow>;
  primaryProduct?: string | null;
  primaryProductRevenueShare?: number | null;
};

function fetchAssessment(symbol: string): Promise<Tier1PreRevenueAssessment | null> {
  const key = symbol.trim().toUpperCase();
  const cached = assessmentPromiseCache.get(key);
  if (cached) return cached;
  const promise = fetch(`/api/tier1-pre-revenue?symbol=${encodeURIComponent(key)}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json() as { ok?: boolean; assessment?: Tier1PreRevenueAssessment };
      return payload.ok && payload.assessment ? payload.assessment : null;
    })
    .catch(() => null);
  assessmentPromiseCache.set(key, promise);
  return promise;
}

function costQuartileIsInactive(gate: Tier1Gate | null | undefined): boolean {
  return Boolean(gate?.reason.startsWith('N/A — Cost Quartile är avstängd'));
}

function assessmentIsProvisional(assessment: Tier1PreRevenueAssessment | null): boolean {
  if (!assessment || costQuartileIsInactive(assessment.gates.cost)) return false;
  return assessment.status === 'TIER_2' && assessment.gates.cost.status === 'NOT_VERIFIED';
}

function overallText(assessment: Tier1PreRevenueAssessment | null): string {
  if (!assessment) return 'Ej verifierad';
  const provisional = assessmentIsProvisional(assessment) ? ' · prov.' : '';
  if (assessment.status === 'TIER_1') return 'Tier 1';
  if (assessment.status === 'TIER_2') return `Tier 2${provisional}`;
  if (assessment.status === 'TIER_3') return 'Tier 3';
  if (assessment.status === 'NOT_QUALIFIED') return 'Ej kvalificerad';
  return 'Ej verifierad';
}

function gateText(gate: Tier1Gate): string {
  if (costQuartileIsInactive(gate)) return 'N/A';
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

function formatCyclePrice(value: number, unit: CyclePriceDisplayRow['unit']): string {
  const digits = unit === 'USD/tonne' ? 0 : 2;
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: digits })} ${unit}`;
}

function formatScaleQuantity(row: ScaleProductDisplayRow): string {
  const value = typeof row.normalizedQuantity === 'number' && Number.isFinite(row.normalizedQuantity)
    ? row.normalizedQuantity
    : row.averageAnnualQuantity;
  const unit = row.normalizedUnit ?? row.inputUnit;
  if (!Number.isFinite(value)) return '—';
  if (unit === 'toz') {
    if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)} Moz/år`;
    if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000, 1)} koz/år`;
    return `${formatNumber(value, 0)} oz/år`;
  }
  if (unit === 'tonne') {
    if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)} Mt/år`;
    if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000, 1)} kt/år`;
    return `${formatNumber(value, 0)} t/år`;
  }
  if (unit === 'lb') {
    if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000, 2)} Mlb/år`;
    return `${formatNumber(value, 0)} lb/år`;
  }
  return `${formatNumber(value)} ${unit}/år`;
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

function costPositionRows(assessment: Tier1PreRevenueAssessment | null): CostPositionDisplayRow[] {
  const support = extendedSupport(assessment);
  return Array.isArray(support?.costPositionEvidence)
    ? support.costPositionEvidence.filter((row) => row && typeof row.projectId === 'string' && typeof row.recipeId === 'string')
    : [];
}

function scaleProductRows(assessment: Tier1PreRevenueAssessment | null): ScaleProductDisplayRow[] {
  const support = extendedSupport(assessment);
  if (support?.scaleProducts && typeof support.scaleProducts === 'object') {
    return Object.values(support.scaleProducts)
      .filter((row) => row && typeof row.product === 'string' && Number.isFinite(row.averageAnnualQuantity))
      .sort((a, b) => {
        if (a.scored !== b.scored) return a.scored ? -1 : 1;
        if (a.scored && b.scored) return (b.equivalent ?? -Infinity) - (a.equivalent ?? -Infinity);
        return a.product.localeCompare(b.product);
      });
  }
  return assessment?.support.scaleEquivalentByMetal
    ? Object.entries(assessment.support.scaleEquivalentByMetal)
        .filter(([, equivalent]) => typeof equivalent === 'number' && Number.isFinite(equivalent))
        .map(([product, equivalent]) => ({
          product,
          averageAnnualQuantity: assessment.support.averageAnnualPayableByMetal?.[product as keyof typeof assessment.support.averageAnnualPayableByMetal] ?? Number.NaN,
          inputUnit: '',
          normalizedQuantity: null,
          normalizedUnit: null,
          threshold: null,
          thresholdUnit: null,
          equivalent: equivalent as number,
          scored: true,
          reason: '',
        }))
    : [];
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
    if (assessmentIsProvisional(assessment)) return 'Tier 2 är provisorisk eftersom en aktiv Tier-gate fortfarande kan sänka klassningen. Klicka för detaljer.';
    return 'Klicka för full Tier-bedömning.';
  }, [assessment]);
  if (!loaded) return <span title="Tier-bedömning beräknas…">…</span>;

  const support = extendedSupport(assessment);
  const primaryProduct = support?.primaryProduct ?? assessment?.primaryMetal ?? null;
  const primaryProductRevenueShare = support?.primaryProductRevenueShare ?? assessment?.primaryMetalRevenueShare ?? null;
  const benchmark = assessment?.primaryMetal ? TIER1_COST_BENCHMARKS[assessment.primaryMetal] : null;
  const scaleEntries = scaleProductRows(assessment);
  const scaleWindow = assessment?.support.scaleWindowStartYear && assessment.support.scaleWindowEndYear
    ? `${assessment.support.scaleWindowStartYear}–${assessment.support.scaleWindowEndYear}`
    : '—';
  const diagnostics = assessment ? displayDiagnostics(assessment.diagnostics) : [];
  const cyclePrices = cyclePriceRows(assessment);
  const costPositions = costPositionRows(assessment);
  const costInactive = costQuartileIsInactive(assessment?.gates.cost);
  const costBasisLabel = costInactive
    ? 'Diagnostik · ej Tier-input'
    : primaryProduct && !assessment?.primaryMetal
      ? 'Ej verifierad'
      : support?.costMethod === 'REPORTED_COST_BEST_AVAILABLE' ? 'Rapporterad cost' : 'Ekonomisk modell';

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
            <p>Tier-ekonomin räknas apples-to-apples med Instrumentbrädans gemensamma aktuella spot-deck och den ekonomiska information som finns i project_json. Produktionsskala och LOM är prisoberoende. Cost Quartile är för närvarande N/A och påverkar inte Tier-resultatet.</p>
          </div>
          <button type="button" className="tier1-modal__close" onClick={() => setOpen(false)} aria-label="Stäng Tier-bedömning">×</button>
        </div>

        {!assessment ? <div className="tier1-modal__empty">Tier-bedömningen kunde inte hämtas.</div> : <>
          <div className="tier1-modal__classification">{assessment.classificationReason}</div>

          <div className="tier1-modal__summary">
            <div><span>Primär produkt</span><strong>{primaryProduct ?? 'Ej verifierad'}</strong></div>
            <div><span>Revenue-andel · spot</span><strong>{typeof primaryProductRevenueShare === 'number' ? `${(primaryProductRevenueShare * 100).toFixed(1)} %` : '—'}</strong></div>
            <div><span>Uthållig combined scale</span><strong>{typeof assessment.support.combinedScaleEquivalent === 'number' ? `${assessment.support.combinedScaleEquivalent.toFixed(2)}x` : '—'}</strong></div>
            <div><span>Skalfönster</span><strong>{scaleWindow}</strong></div>
            <div><span>Kapitalmått · spot</span><strong>{assessment.support.capitalReturnsMetric ?? '—'}</strong></div>
            <div><span>Tier-IRR · spot</span><strong>{typeof assessment.support.tierBaseIrr === 'number' ? `${(assessment.support.tierBaseIrr * 100).toFixed(1)} %` : 'n/a'}</strong></div>
            {assessment.support.tierBaseIrrMethod === 'NEXT_PROJECT_IRR' && <div><span>IRR-projekt</span><strong>{assessment.support.tierBaseIrrProjectIds?.join(', ') || 'n/a'}</strong></div>}
            <div><span>Cost Quartile</span><strong>{gateText(assessment.gates.cost)}</strong></div>
            <div><span>Cost-underlag</span><strong>{costBasisLabel}</strong></div>
            <div><span>Spotdatum</span><strong>{formatDate(assessment.support.tierBasePriceAsOfUtc)}</strong></div>
          </div>

          <div className="tier1-modal__gates">
            <GateRow label="1. Lång livslängd" gate={assessment.gates.lom} />
            <GateRow label="2. Produktionsskala" gate={assessment.gates.scale} />
            <GateRow label="3. Cost Quartile · inaktiv" gate={assessment.gates.cost} />
            <GateRow label="4. Cykelresistens" gate={assessment.gates.cycle} />
            <GateRow label="5. Kapitalavkastning" gate={assessment.gates.capitalReturns} />
          </div>

          {scaleEntries.length > 0 && <div className="tier1-modal__section">
            <h4>Skala · produkt för produkt</h4>
            <div className="tier1-modal__chips">
              {scaleEntries.map((row) => <span key={row.product} title={row.reason || undefined}>
                <strong>{row.product}</strong> {formatScaleQuantity(row)} · {row.scored && typeof row.equivalent === 'number' ? `${formatNumber(row.equivalent)}x` : 'ej poängsatt'}
              </span>)}
            </div>
            <p>Skalan använder bästa sammanhängande 10-årsfönster när minst tio produktionsår finns; kortare projekt använder hela den tillgängliga produktionsperioden. Alla verifierade fysiska produkter visas. Endast exakta produkter med aktiverad Tier-scale-gräns bidrar till combined scale; ingen metallpris- eller AuEq-konvertering används.</p>
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
            </>}
            {assessment.support.cycleMethod && <p><strong>Cykelmetod:</strong> {assessment.support.cycleMethod}</p>}
          </div>

          {support?.costProjectDetails && support.costProjectDetails.length > 0 && <div className="tier1-modal__section">
            <h4>Kostnadsunderlag · project_json · diagnostik</h4>
            <ul>{support.costProjectDetails.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>}

          <Tier1CostReferencePanel
            rows={costPositions}
            primaryMetal={benchmark?.metal ?? assessment.primaryMetal}
            hardCostGateVerified={false}
          />

          {diagnostics.length > 0 && <details className="tier1-modal__section tier1-modal__diagnostics">
            <summary>Teknisk diagnostik</summary>
            <ul>{diagnostics.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </details>}
        </>}
      </section>
    </div>}
  </>;
}
