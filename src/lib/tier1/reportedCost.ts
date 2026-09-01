import type { Tier1CostBasisId, Tier1CostMetric } from './config.ts';
import { TIER1_COST_BASIS_IDS, TIER1_COST_METRIC_IDS } from './config.ts';
import type {
  ProjectReportedCostBasis,
  ProjectReportedCostByProductTreatment,
  ProjectReportedCostComponentTreatment,
  ProjectReportedCostCoProductMethod,
  ProjectReportedCostDenominator,
  ProjectReportedCostPeriod,
  ProjectReportedCostQuality,
} from '../project/jsonv1/costSemantics.ts';
import { convertMass, convertPreciousQuantity } from '../prices/units.ts';

export type ReportedCostEvidence = {
  status: 'AVAILABLE' | 'NOT_AVAILABLE' | 'INVALID';
  metric: Tier1CostMetric;
  reportedLabel: string | null;
  definitionNotes: string | null;
  primaryMetal: string | null;
  basis: ProjectReportedCostBasis | null;
  denominator: ProjectReportedCostDenominator | null;
  period: ProjectReportedCostPeriod | null;
  byProductTreatment: ProjectReportedCostByProductTreatment | null;
  royaltyTreatment: ProjectReportedCostComponentTreatment | null;
  offSiteTreatment: ProjectReportedCostComponentTreatment | null;
  coProductMethod: ProjectReportedCostCoProductMethod | null;
  equivalentFormula: string | null;
  quality: ProjectReportedCostQuality | null;
  basisId: Tier1CostBasisId | null;
  value: number | null;
  unit: 'USD/lb' | 'USD/toz' | null;
  costBaseYear: number | null;
  sourceId: string | null;
  pageOrTable: string | null;
  reason: string;
};

const VALID_METRICS = new Set<Tier1CostMetric>(TIER1_COST_METRIC_IDS);
const VALID_BASIS_IDS = new Set<Tier1CostBasisId>(TIER1_COST_BASIS_IDS);
const BASIS = new Set(['net_by_product', 'co_product', 'before_by_product', 'reported_other', 'unknown']);
const DENOMINATOR = new Set(['payable_primary_metal', 'produced_primary_metal', 'metal_equivalent', 'sold_metal', 'other', 'unknown']);
const BYPRODUCT = new Set(['credited', 'co_product_allocation', 'excluded', 'not_applicable', 'unknown']);
const COMPONENT = new Set(['included', 'excluded', 'partial', 'not_applicable', 'unknown']);
const CO_PRODUCT_METHOD = new Set(['metal_equivalent_denominator', 'revenue_allocation', 'physical_allocation', 'reported_other', 'unknown']);
const QUALITY = new Set(['reported_exact', 'reported_basis_incomplete']);

function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function parseRaw(rawJson: unknown): Record<string, unknown> {
  if (typeof rawJson === 'string') { try { return record(JSON.parse(rawJson)); } catch { return {}; } }
  return record(rawJson);
}
function stringOrNull(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function enumOrNull<T extends string>(value: unknown, values: Set<string>): T | null { return typeof value === 'string' && values.has(value) ? value as T : null; }
function parsePeriod(value: unknown): ProjectReportedCostPeriod | null {
  const raw = record(value);
  const kind = raw.kind;
  if (kind === 'LOM' || kind === 'STEADY_STATE' || kind === 'UNKNOWN') return { kind };
  if (kind === 'FIRST_N_OPERATING_YEARS' && Number.isInteger(raw.years) && (raw.years as number) > 0) return { kind, years: raw.years as number };
  if (kind === 'OTHER' && typeof raw.label === 'string' && raw.label.trim()) return { kind, label: raw.label.trim() };
  return null;
}
function emptyEvidence(status: 'NOT_AVAILABLE' | 'INVALID', metric: Tier1CostMetric, reason: string): ReportedCostEvidence {
  return { status, metric, reportedLabel: null, definitionNotes: null, primaryMetal: null, basis: null, denominator: null, period: null, byProductTreatment: null, royaltyTreatment: null, offSiteTreatment: null, coProductMethod: null, equivalentFormula: null, quality: null, basisId: null, value: null, unit: null, costBaseYear: null, sourceId: null, pageOrTable: null, reason };
}
function parseEvidence(entry: Record<string, unknown>, expectedMetric: Tier1CostMetric): ReportedCostEvidence | null {
  if (entry.metric !== expectedMetric || !VALID_METRICS.has(expectedMetric) || !finite(entry.value) || (entry.unit !== 'USD/lb' && entry.unit !== 'USD/toz')) return null;
  const rawBasisId = entry.basisId;
  const basisId = typeof rawBasisId === 'string' && VALID_BASIS_IDS.has(rawBasisId as Tier1CostBasisId) ? rawBasisId as Tier1CostBasisId : null;
  const rawCostBaseYear = entry.costBaseYear;
  const costBaseYear = Number.isInteger(rawCostBaseYear) && (rawCostBaseYear as number) >= 1900 && (rawCostBaseYear as number) <= 2100 ? rawCostBaseYear as number : null;
  const evidence: ReportedCostEvidence = {
    status: 'AVAILABLE', metric: expectedMetric,
    reportedLabel: stringOrNull(entry.reportedLabel), definitionNotes: stringOrNull(entry.definitionNotes), primaryMetal: stringOrNull(entry.primaryMetal),
    basis: enumOrNull<ProjectReportedCostBasis>(entry.basis, BASIS), denominator: enumOrNull<ProjectReportedCostDenominator>(entry.denominator, DENOMINATOR), period: parsePeriod(entry.period),
    byProductTreatment: enumOrNull<ProjectReportedCostByProductTreatment>(entry.byProductTreatment, BYPRODUCT),
    royaltyTreatment: enumOrNull<ProjectReportedCostComponentTreatment>(entry.royaltyTreatment, COMPONENT), offSiteTreatment: enumOrNull<ProjectReportedCostComponentTreatment>(entry.offSiteTreatment, COMPONENT),
    coProductMethod: enumOrNull<ProjectReportedCostCoProductMethod>(entry.coProductMethod, CO_PRODUCT_METHOD),
    equivalentFormula: stringOrNull(entry.equivalentFormula),
    quality: enumOrNull<ProjectReportedCostQuality>(entry.quality, QUALITY), basisId,
    value: entry.value as number, unit: entry.unit as 'USD/lb' | 'USD/toz', costBaseYear,
    sourceId: stringOrNull(entry.sourceId), pageOrTable: stringOrNull(entry.pageOrTable), reason: '',
  };
  const context = [evidence.reportedLabel ? `rapportmått “${evidence.reportedLabel}”` : null, evidence.period?.kind ? `period ${evidence.period.kind}` : null, evidence.basis ? `basis ${evidence.basis}` : null, evidence.denominator ? `denominator ${evidence.denominator}` : null, evidence.sourceId ? `källa ${evidence.sourceId}` : null, evidence.pageOrTable, evidence.costBaseYear ? `kostnadsår ${evidence.costBaseYear}` : null].filter(Boolean).join(', ');
  evidence.reason = context ? `Rapporterad kostnadsuppgift bevaras som evidence (${context}).` : 'Rapporterad kostnadsuppgift bevaras som evidence.';
  return evidence;
}

export function extractReportedCostEvidenceCandidates(rawJson: unknown, expectedMetric: Tier1CostMetric): ReportedCostEvidence[] {
  const root = parseRaw(rawJson);
  const rawEntries = record(root.economicsBreakdown).reportedCostMetrics;
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries.map((item) => parseEvidence(record(item), expectedMetric)).filter((item): item is ReportedCostEvidence => item !== null);
}

function semanticKey(evidence: ReportedCostEvidence): string {
  return JSON.stringify([evidence.primaryMetal, evidence.basis, evidence.denominator, evidence.byProductTreatment, evidence.royaltyTreatment, evidence.offSiteTreatment, evidence.coProductMethod, evidence.equivalentFormula, evidence.costBaseYear]);
}

/** Backwards-compatible single-reader. Never resolves semantically different rows by array order. */
export function extractReportedCostEvidence(rawJson: unknown, expectedMetric: Tier1CostMetric): ReportedCostEvidence {
  const root = parseRaw(rawJson);
  const rawEntries = record(root.economicsBreakdown).reportedCostMetrics;
  if (rawEntries === undefined || rawEntries === null) return emptyEvidence('NOT_AVAILABLE', expectedMetric, `Ingen rapporterad kostnadsuppgift mappad till ${expectedMetric} finns i economicsBreakdown.reportedCostMetrics.`);
  if (!Array.isArray(rawEntries)) return emptyEvidence('INVALID', expectedMetric, 'economicsBreakdown.reportedCostMetrics måste vara en array.');
  const candidates = extractReportedCostEvidenceCandidates(rawJson, expectedMetric);
  if (candidates.length === 0) return emptyEvidence('INVALID', expectedMetric, `Rapporterad kostnadsuppgift mappad till ${expectedMetric} finns men saknar användbart value/unit.`);
  if (candidates.length === 1) return candidates[0];
  const lom = candidates.filter((candidate) => candidate.period?.kind === 'LOM');
  if (lom.length === 1 && candidates.every((candidate) => semanticKey(candidate) === semanticKey(lom[0]))) return lom[0];
  return emptyEvidence('INVALID', expectedMetric, `Flera rapporterade ${expectedMetric}-mått finns med olika eller otillräckligt definierade semantiska basis. Arrayordning får inte avgöra vilket mått Tier använder.`);
}

export function reportedCostWeightInBenchmarkUnits(args: { payableSeries: Array<number | null>; payableUnit: string; benchmarkUnit: 'USD/lb' | 'USD/toz' }): number | null {
  let total = 0;
  for (const value of args.payableSeries) {
    if (!finite(value) || value <= 0) continue;
    let converted: number | null;
    try {
      if (args.benchmarkUnit === 'USD/lb') {
        if (!['lb','kg','tonne','short_ton','long_ton'].includes(args.payableUnit)) return null;
        converted = convertMass(value, args.payableUnit as 'lb' | 'kg' | 'tonne' | 'short_ton' | 'long_ton', 'lb');
      } else {
        if (!['toz','g','kg'].includes(args.payableUnit)) return null;
        converted = convertPreciousQuantity(value, args.payableUnit as 'toz' | 'g' | 'kg', 'toz');
      }
    } catch { return null; }
    if (!finite(converted) || converted < 0) return null;
    total += converted;
  }
  return total > 0 ? total : null;
}
