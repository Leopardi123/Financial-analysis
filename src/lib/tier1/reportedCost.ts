import type { Tier1CostBasisId, Tier1CostMetric } from './config.ts';
import { TIER1_COST_BASIS_IDS, TIER1_COST_METRIC_IDS } from './config.ts';
import { convertMass, convertPreciousQuantity } from '../prices/units.ts';

export type ReportedCostEvidence = {
  status: 'AVAILABLE' | 'NOT_AVAILABLE' | 'INVALID';
  metric: Tier1CostMetric;
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

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseRaw(rawJson: unknown): Record<string, unknown> {
  if (typeof rawJson === 'string') {
    try {
      return record(JSON.parse(rawJson));
    } catch {
      return {};
    }
  }
  return record(rawJson);
}

/**
 * Best-available reported-cost reader for Tier.
 *
 * project_json describes the current project model; it does not need to carry
 * benchmark-specific proof fields in order for Tier to use an explicit cost
 * disclosed in the JSON. metric + value + unit are the only required fields.
 * Legacy basis/year/source fields are accepted as optional diagnostics.
 *
 * If more than one usable entry exists for the same metric, the last usable
 * entry wins. This lets the JSON carry a newer current estimate without making
 * an older report value a hard guard on the current model.
 */
export function extractReportedCostEvidence(rawJson: unknown, expectedMetric: Tier1CostMetric): ReportedCostEvidence {
  const root = parseRaw(rawJson);
  const economicsBreakdown = record(root.economicsBreakdown);
  const rawEntries = economicsBreakdown.reportedCostMetrics;
  if (rawEntries === undefined || rawEntries === null) {
    return {
      status: 'NOT_AVAILABLE', metric: expectedMetric, basisId: null, value: null, unit: null,
      costBaseYear: null, sourceId: null, pageOrTable: null,
      reason: `Ingen rapporterad ${expectedMetric} finns i economicsBreakdown.reportedCostMetrics.`,
    };
  }
  if (!Array.isArray(rawEntries)) {
    return {
      status: 'INVALID', metric: expectedMetric, basisId: null, value: null, unit: null,
      costBaseYear: null, sourceId: null, pageOrTable: null,
      reason: 'economicsBreakdown.reportedCostMetrics måste vara en array.',
    };
  }

  const matches = rawEntries
    .map((item) => record(item))
    .filter((item) => item.metric === expectedMetric);
  if (matches.length === 0) {
    return {
      status: 'NOT_AVAILABLE', metric: expectedMetric, basisId: null, value: null, unit: null,
      costBaseYear: null, sourceId: null, pageOrTable: null,
      reason: `Ingen rapporterad ${expectedMetric} finns i economicsBreakdown.reportedCostMetrics.`,
    };
  }

  const usable = matches.filter((entry) => {
    const metric = entry.metric;
    const value = entry.value;
    const unit = entry.unit;
    return typeof metric === 'string'
      && VALID_METRICS.has(metric as Tier1CostMetric)
      && finite(value)
      && value >= 0
      && (unit === 'USD/lb' || unit === 'USD/toz');
  });

  if (usable.length === 0) {
    return {
      status: 'INVALID', metric: expectedMetric, basisId: null, value: null, unit: null,
      costBaseYear: null, sourceId: null, pageOrTable: null,
      reason: `Rapporterad ${expectedMetric} finns men saknar användbart value/unit.`,
    };
  }

  const entry = usable[usable.length - 1];
  const rawBasisId = entry.basisId;
  const basisId = typeof rawBasisId === 'string' && VALID_BASIS_IDS.has(rawBasisId as Tier1CostBasisId)
    ? rawBasisId as Tier1CostBasisId
    : null;
  const rawCostBaseYear = entry.costBaseYear;
  const costBaseYear = Number.isInteger(rawCostBaseYear) && (rawCostBaseYear as number) >= 1900 && (rawCostBaseYear as number) <= 2100
    ? rawCostBaseYear as number
    : null;
  const sourceId = typeof entry.sourceId === 'string' && entry.sourceId.trim() ? entry.sourceId.trim() : null;
  const pageOrTable = typeof entry.pageOrTable === 'string' && entry.pageOrTable.trim() ? entry.pageOrTable.trim() : null;
  const value = entry.value as number;
  const unit = entry.unit as 'USD/lb' | 'USD/toz';

  const optionalContext = [
    sourceId ? `källa ${sourceId}` : null,
    pageOrTable ? pageOrTable : null,
    costBaseYear ? `kostnadsår ${costBaseYear}` : null,
  ].filter(Boolean).join(', ');

  return {
    status: 'AVAILABLE',
    metric: expectedMetric,
    basisId,
    value,
    unit,
    costBaseYear,
    sourceId,
    pageOrTable,
    reason: optionalContext
      ? `Rapporterad ${expectedMetric} används som bästa tillgängliga kostnadsuppgift (${optionalContext}).`
      : `Rapporterad ${expectedMetric} används som bästa tillgängliga kostnadsuppgift i project_json.`,
  };
}

export function reportedCostWeightInBenchmarkUnits(args: {
  payableSeries: Array<number | null>;
  payableUnit: string;
  benchmarkUnit: 'USD/lb' | 'USD/toz';
}): number | null {
  let total = 0;
  for (const value of args.payableSeries) {
    if (!finite(value) || value <= 0) continue;
    let converted: number | null;
    try {
      if (args.benchmarkUnit === 'USD/lb') {
        if (args.payableUnit !== 'lb' && args.payableUnit !== 'kg' && args.payableUnit !== 'tonne' && args.payableUnit !== 'short_ton' && args.payableUnit !== 'long_ton') return null;
        converted = convertMass(value, args.payableUnit, 'lb');
      } else {
        if (args.payableUnit !== 'toz' && args.payableUnit !== 'g' && args.payableUnit !== 'kg') return null;
        converted = convertPreciousQuantity(value, args.payableUnit, 'toz');
      }
    } catch {
      return null;
    }
    if (!finite(converted) || converted < 0) return null;
    total += converted;
  }
  return total > 0 ? total : null;
}
