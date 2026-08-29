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
 * Optional raw project_json evidence contract:
 * economicsBreakdown.reportedCostMetrics: [
 *   {
 *     metric: 'C1_CU_USD_PER_LB',
 *     basisId: 'S_AND_P_CO_PRODUCT_C1_CU',
 *     value: 1.32,
 *     unit: 'USD/lb',
 *     costBaseYear: 2025,
 *     sourceId: 'santa-cruz-pfs-2025',
 *     pageOrTable: 'Table 18-5'
 *   }
 * ]
 *
 * The Tier engine never infers basisId from the metric name. The evidence must
 * state the verified definition explicitly so reported AISC/C1 can be compared
 * only to the same benchmark definition.
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
  if (matches.length !== 1) {
    return {
      status: 'INVALID', metric: expectedMetric, basisId: null, value: null, unit: null,
      costBaseYear: null, sourceId: null, pageOrTable: null,
      reason: `Exakt en rapporterad ${expectedMetric} krävs; ${matches.length} poster hittades.`,
    };
  }

  const entry = matches[0];
  const metric = entry.metric;
  const basisId = entry.basisId;
  const value = entry.value;
  const unit = entry.unit;
  const costBaseYear = entry.costBaseYear;
  const sourceId = typeof entry.sourceId === 'string' && entry.sourceId.trim() ? entry.sourceId.trim() : null;
  const pageOrTable = typeof entry.pageOrTable === 'string' && entry.pageOrTable.trim() ? entry.pageOrTable.trim() : null;

  if (typeof metric !== 'string' || !VALID_METRICS.has(metric as Tier1CostMetric)) {
    return {
      status: 'INVALID', metric: expectedMetric, basisId: null, value: null, unit: null,
      costBaseYear: null, sourceId, pageOrTable,
      reason: `Ogiltig rapporterad cost metric: ${String(metric)}.`,
    };
  }
  if (typeof basisId !== 'string' || !VALID_BASIS_IDS.has(basisId as Tier1CostBasisId)) {
    return {
      status: 'INVALID', metric: expectedMetric, basisId: null, value: finite(value) ? value : null, unit: null,
      costBaseYear: null, sourceId, pageOrTable,
      reason: `Ogiltig eller saknad cost basisId för ${expectedMetric}; definition får inte gissas.`,
    };
  }
  if (!finite(value) || value < 0) {
    return {
      status: 'INVALID', metric: expectedMetric, basisId: basisId as Tier1CostBasisId, value: null, unit: null,
      costBaseYear: null, sourceId, pageOrTable,
      reason: `Rapporterat ${expectedMetric}-värde måste vara ett ändligt tal ≥0.`,
    };
  }
  if (unit !== 'USD/lb' && unit !== 'USD/toz') {
    return {
      status: 'INVALID', metric: expectedMetric, basisId: basisId as Tier1CostBasisId, value, unit: null,
      costBaseYear: null, sourceId, pageOrTable,
      reason: `Rapporterad enhet för ${expectedMetric} måste vara USD/lb eller USD/toz.`,
    };
  }
  if (!Number.isInteger(costBaseYear) || (costBaseYear as number) < 1900 || (costBaseYear as number) > 2100) {
    return {
      status: 'INVALID', metric: expectedMetric, basisId: basisId as Tier1CostBasisId, value, unit,
      costBaseYear: null, sourceId, pageOrTable,
      reason: `costBaseYear saknas eller är ogiltigt för rapporterad ${expectedMetric}.`,
    };
  }
  if (!sourceId || !pageOrTable) {
    return {
      status: 'INVALID', metric: expectedMetric, basisId: basisId as Tier1CostBasisId, value, unit,
      costBaseYear: costBaseYear as number, sourceId, pageOrTable,
      reason: `Rapporterad ${expectedMetric} kräver sourceId och exakt pageOrTable.`,
    };
  }

  return {
    status: 'AVAILABLE',
    metric: expectedMetric,
    basisId: basisId as Tier1CostBasisId,
    value,
    unit,
    costBaseYear: costBaseYear as number,
    sourceId,
    pageOrTable,
    reason: `Rapporterad ${expectedMetric} används direkt från ${sourceId}, ${pageOrTable}; definitionsbasis ${basisId}.`,
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
