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

function assessmentIsProvisional(assessment: Tier1PreRevenueAssessment | null): boolean {
  if (!assessment) return false;
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

function costPositionLabel(value: CostPositionDisplayRow['rawReferencePosition']): string {
  if (value === 'BELOW_Q1_REFERENCE') return 'Under Q1-referensen';
  if (value === 'Q1_TO_P50_REFERENCE') return 'Mellan Q1 och P50';
  if (value === 'P50_TO_Q3_REFERENCE') return 'Mellan P50 och P75';
  if (value === 'ABOVE_Q3_REFERENCE') return 'Över P75';
  return 'Ej jämförbar';
}

function costComparabilityLabel(value: CostPositionDisplayRow['comparability']): string {
  if (value === 'DIRECT_REFERENCE') return 'Direkt referens';
  if (value === 'REFERENCE_ONLY') return 'Endast referens';
  return 'Ej jämförbar';
}

function costEvidenceLabel(value: CostPositionDisplayRow['costEvidenceClass']): string {
  if (value === 'ACTUAL_OPERATION') return 'Actual operation';
  if (value === 'FS_ESTIMATE') return 'FS-estimat';
  if (value === 'PFS_ESTIMATE') return 'PFS-estimat';
  if (value === 'PEA_ESTIMATE') return 'PEA-estimat';
  if (value === 'OTHER_ESTIMATE') return 'Annat estimat';
  return 'Okänd';
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
    if (assessmentIsProvisional(assessment)) return 'Tier 2 är provisorisk eftersom kostnads-Tier fortfarande kan sänka klassningen. Klicka för detaljer.';
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
  const costBasisLabel = primaryProduct && !assessment?.primaryMetal
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
            <p>Tier-ekonomin räknas apples-to-apples med Instrumentbrädans gemensamma aktuella spot-deck och den ekonomiska information som finns i project_json. Produktionsskala och LOM är prisoberoende.</p>
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
            <div><span>Tier-IRR · spot</span><strong>{typeof assessment.support.tierBaseIrr === 'number' ? `${(assessment.support.tierBaseIrr * 100).toFixed(1)} %` : '—'}</strong></div>
            <div><span>Kostnads-Tier</span><strong>{gateText(assessment.gates.cost)}</strong></div>
            <div><span>Cost-underlag</span><strong>{costBasisLabel}</strong></div>
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
            <h4>Kostnadsunderlag · project_json</h4>
            <ul>{support.costProjectDetails.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>}

          {costPositions.length > 0 && <div className="tier1-modal__section">
            <h4>Kostnadsposition · referensdiagnostik</h4>
            <p><strong>Påverkar inte Tier-gaten.</strong> Projektkostnaden visas i sin verifierade definition och sitt eget kostnadsår. Ingen CPI-, FX- eller annan vintage-rebasing görs för att få gruvan att passa referensen.</p>
            {costPositions.map((row) => <div key={`${row.projectId}-${row.recipeId}`} className="tier1-modal__gate tier1-modal__gate--not-verified">
              <div className="tier1-modal__gate-head"><strong>{row.projectId}</strong><span>{costComparabilityLabel(row.comparability).toUpperCase()}</span></div>
              <dl className="tier1-modal__facts">
                <div><dt>Source-locked recipe</dt><dd>{row.recipeId}</dd></div>
                <div><dt>Projektkostnad</dt><dd>{row.measuredCost === null ? 'Ej verifierad' : `${formatNumber(row.measuredCost, 4)} ${row.measuredCostUnit ?? ''}`}</dd></div>
                <div><dt>Projektmetric</dt><dd>{row.measuredMetric}</dd></div>
                <div><dt>Cost base year</dt><dd>{row.costBaseYear ?? 'Ej verifierad'}</dd></div>
                <div><dt>Evidensklass</dt><dd>{costEvidenceLabel(row.costEvidenceClass)}</dd></div>
                <div><dt>Referens</dt><dd>{row.referenceDataYear} · {row.reference.denominatorLabel}</dd></div>
                <div><dt>Referensmetric</dt><dd>{row.referenceMetric}</dd></div>
                <div><dt>Q1 / P50 / P75</dt><dd>{`${formatNumber(row.reference.q1Max, 3)} / ${formatNumber(row.reference.p50Max, 3)} / ${formatNumber(row.reference.p75Max, 3)} ${row.reference.unit}`}</dd></div>
                <div><dt>Rå position</dt><dd>{costPositionLabel(row.rawReferencePosition)}</dd></div>
                <div><dt>Jämförbarhet</dt><dd>{costComparabilityLabel(row.comparability)}</dd></div>
                <div><dt>Justerad kostnad</dt><dd>Ingen</dd></div>
                <div><dt>Hard Cost Tier</dt><dd>Ingen</dd></div>
              </dl>
              <div className="tier1-modal__gate-reason">{row.reason}</div>
            </div>)}
          </div>}

          {benchmark && <div className="tier1-modal__section">
            <h4>Kostnadskurva · {benchmark.metal}</h4>
            <dl className="tier1-modal__facts">
              <div><dt>P25 / Q1 max</dt><dd>{benchmark.q1Max === null ? 'Ej verifierad' : `${formatNumber(benchmark.q1Max)} ${benchmark.unit}`}</dd></div>
              <div><dt>P50 / median</dt><dd>{benchmark.p50Max === null ? 'Ej verifierad' : `${formatNumber(benchmark.p50Max)} ${benchmark.unit}`}</dd></div>
              <div><dt>P75</dt><dd>{benchmark.p75Max === null ? 'Ej verifierad' : `${formatNumber(benchmark.p75Max)} ${benchmark.unit}`}</dd></div>
              <div><dt>Kurvtyp</dt><dd>{benchmark.benchmarkKind === 'FULL_QUARTILE_CURVE' ? 'Full P25/P50/P75' : benchmark.benchmarkKind === 'EXACT_Q1_BOUNDARY' ? 'Exakt Q1-gräns' : benchmark.benchmarkKind === 'CURVE_IDENTIFIED_NO_BOUNDARIES' ? 'Kurva identifierad · gränser saknas' : 'Q1-referens · pass-only'}</dd></div>
              <div><dt>Jämförelse</dt><dd>{benchmark.comparisonEnabled ? 'Aktiverad' : 'Ej aktiverad'}</dd></div>
              <div><dt>Gränsosäkerhet</dt><dd>{benchmark.boundaryUncertaintyAbs > 0 ? `±${formatNumber(benchmark.boundaryUncertaintyAbs)} ${benchmark.unit}` : 'Ingen angiven'}</dd></div>
            </dl>
            <p>{benchmark.notes}</p>
            <p><strong>Benchmarkbasis:</strong> {benchmark.basisId}</p>
            <p><strong>Dataperiod:</strong> {benchmark.dataPeriod}{benchmark.sourcePageOrTable ? ` · ${benchmark.sourcePageOrTable}` : ''}</p>
            <a href={benchmark.sourceUrl} target="_blank" rel="noreferrer">Källa</a>{benchmark.evidenceUrl && <> · <a href={benchmark.evidenceUrl} target="_blank" rel="noreferrer">Evidens</a></>}
          </div>}

          {diagnostics.length > 0 && <details className="tier1-modal__section tier1-modal__diagnostics">
            <summary>Teknisk diagnostik</summary>
            <ul>{diagnostics.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
          </details>}
        </>}
      </section>
    </div>}
  </>;
}
