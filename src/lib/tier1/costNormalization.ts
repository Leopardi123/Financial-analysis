import type {
  ProjectReportedCostBasis,
  ProjectReportedCostDenominator,
} from '../project/jsonv1/costSemantics.ts';
import { convertMass, convertPreciousQuantity } from '../prices/units.ts';
import {
  S_AND_P_CO_PRODUCT_C1_CU_DEFINITION,
  assessCuC1DefinitionReadiness,
  type Tier1CuC1DefinitionContract,
} from './costDefinitionContract.ts';

export type Tier1CostNormalizationDenominatorUnit = 'lb' | 'tonne' | 'toz';
export type Tier1CostNormalizationUnit = 'USD/lb' | 'USD/tonne' | 'USD/toz';
export type Tier1CostNormalizationOperation = 'ADD' | 'SUBTRACT';

export type Tier1CostNormalizationTerm = {
  id: string;
  role: string;
  operation: Tier1CostNormalizationOperation;
  seriesUSD: Array<number | null>;
  sourceId: string;
  pageOrTable: string;
};

export type Tier1CostNormalizationDenominator = {
  product: string;
  basis: ProjectReportedCostDenominator;
  series: Array<number | null>;
  unit: string;
  normalizedUnit: Tier1CostNormalizationDenominatorUnit;
  sourceId: string;
  pageOrTable: string;
};

export type Tier1CostNormalizationScope =
  | { kind: 'ALL_PERIODS' }
  | { kind: 'POSITIVE_DENOMINATOR_PERIODS'; fromPeriod?: number }
  | { kind: 'FIRST_N_POSITIVE_DENOMINATOR_PERIODS'; count: number; fromPeriod?: number }
  | { kind: 'EXPLICIT_PERIODS'; periods: number[] };

export type Tier1CostSourceConflict = {
  code: string;
  description: string;
  sourceId?: string | null;
  pageOrTable?: string | null;
};

export type Tier1CostReportCheckpoint = {
  value: number;
  toleranceAbs: number;
  sourceId: string;
  pageOrTable: string;
};

export type Tier1CostNormalizationInput = {
  metric: string;
  reportedLabel: string;
  basis: ProjectReportedCostBasis;
  terms: Tier1CostNormalizationTerm[];
  denominator: Tier1CostNormalizationDenominator;
  scope: Tier1CostNormalizationScope;
  costBaseYear: number | null;
  sourceConflicts?: Tier1CostSourceConflict[];
  reportCheckpoint?: Tier1CostReportCheckpoint | null;
};

export type Tier1CostNormalizationTermTrace = {
  id: string;
  role: string;
  operation: Tier1CostNormalizationOperation;
  selectedTotalUSD: number;
  signedTotalUSD: number;
  sourceId: string;
  pageOrTable: string;
};

export type Tier1CostNormalized = {
  status: 'NORMALIZED';
  metric: string;
  reportedLabel: string;
  basis: ProjectReportedCostBasis;
  value: number;
  unit: Tier1CostNormalizationUnit;
  numeratorUSD: number;
  denominator: {
    product: string;
    basis: ProjectReportedCostDenominator;
    quantity: number;
    unit: Tier1CostNormalizationDenominatorUnit;
    sourceId: string;
    pageOrTable: string;
  };
  selectedPeriods: number[];
  terms: Tier1CostNormalizationTermTrace[];
  costBaseYear: number | null;
  sourceConflicts: Tier1CostSourceConflict[];
  reportReconciliation: {
    status: 'MATCHED' | 'NOT_PROVIDED';
    checkpointValue: number | null;
    difference: number | null;
    toleranceAbs: number | null;
    sourceId: string | null;
    pageOrTable: string | null;
  };
};

export type Tier1CostNormalizationNotVerified = {
  status: 'NOT_VERIFIED';
  reason: string;
};

export type Tier1CostNormalizationResult = Tier1CostNormalized | Tier1CostNormalizationNotVerified;

export type Tier1NormalizedCuC1BenchmarkReadiness = {
  status: 'VERIFIED' | 'NOT_VERIFIED';
  blockers: string[];
};

const MASS_UNITS = new Set(['lb', 'kg', 'tonne', 'short_ton', 'long_ton']);
const PRECIOUS_UNITS = new Set(['toz', 'g', 'kg']);

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteNonNegative(value: unknown): value is number {
  return finite(value) && value >= 0;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function notVerified(reason: string): Tier1CostNormalizationNotVerified {
  return { status: 'NOT_VERIFIED', reason };
}

function normalizedCostUnit(unit: Tier1CostNormalizationDenominatorUnit): Tier1CostNormalizationUnit {
  if (unit === 'lb') return 'USD/lb';
  if (unit === 'tonne') return 'USD/tonne';
  return 'USD/toz';
}

function convertDenominatorQuantity(
  value: number,
  fromUnit: string,
  toUnit: Tier1CostNormalizationDenominatorUnit,
): number | null {
  try {
    if (toUnit === 'toz') {
      if (!PRECIOUS_UNITS.has(fromUnit)) return null;
      return convertPreciousQuantity(value, fromUnit as 'toz' | 'g' | 'kg', 'toz');
    }
    if (!MASS_UNITS.has(fromUnit)) return null;
    return convertMass(
      value,
      fromUnit as 'lb' | 'kg' | 'tonne' | 'short_ton' | 'long_ton',
      toUnit,
    );
  } catch {
    return null;
  }
}

function validateProvenance(sourceId: unknown, pageOrTable: unknown, label: string): string | null {
  if (!nonEmpty(sourceId)) return `${label} saknar sourceId.`;
  if (!nonEmpty(pageOrTable)) return `${label} saknar pageOrTable.`;
  return null;
}

function resolveSelectedPeriods(args: {
  scope: Tier1CostNormalizationScope;
  denominator: Array<number | null>;
  fromUnit: string;
  normalizedUnit: Tier1CostNormalizationDenominatorUnit;
}): number[] | Tier1CostNormalizationNotVerified {
  const { denominator } = args;
  const length = denominator.length;

  const convertedAt = (t: number): number | Tier1CostNormalizationNotVerified => {
    const raw = denominator[t];
    if (!finiteNonNegative(raw)) return notVerified(`Denominator[${t}] måste vara ett ändligt icke-negativt värde.`);
    const converted = convertDenominatorQuantity(raw, args.fromUnit, args.normalizedUnit);
    if (!finiteNonNegative(converted)) return notVerified(`Denominator[${t}] kan inte dimensionssäkert konverteras från ${args.fromUnit} till ${args.normalizedUnit}.`);
    return converted;
  };

  if (args.scope.kind === 'ALL_PERIODS') {
    const periods = Array.from({ length }, (_, t) => t);
    for (const t of periods) {
      const converted = convertedAt(t);
      if (typeof converted !== 'number') return converted;
    }
    return periods;
  }

  if (args.scope.kind === 'EXPLICIT_PERIODS') {
    if (!Array.isArray(args.scope.periods) || args.scope.periods.length === 0) return notVerified('EXPLICIT_PERIODS saknar perioder.');
    const unique = [...new Set(args.scope.periods)];
    if (unique.length !== args.scope.periods.length) return notVerified('EXPLICIT_PERIODS innehåller duplicerade perioder.');
    for (const t of unique) {
      if (!Number.isInteger(t) || t < 0 || t >= length) return notVerified(`EXPLICIT_PERIODS innehåller ogiltig period ${t}.`);
      const converted = convertedAt(t);
      if (typeof converted !== 'number') return converted;
    }
    return unique;
  }

  const fromPeriod = args.scope.fromPeriod ?? 0;
  if (!Number.isInteger(fromPeriod) || fromPeriod < 0 || fromPeriod >= length) {
    return notVerified(`fromPeriod=${fromPeriod} ligger utanför denominatorserien.`);
  }

  const positive: number[] = [];
  for (let t = fromPeriod; t < length; t += 1) {
    const converted = convertedAt(t);
    if (typeof converted !== 'number') return converted;
    if (converted > 0) positive.push(t);
    if (args.scope.kind === 'FIRST_N_POSITIVE_DENOMINATOR_PERIODS' && positive.length === args.scope.count) break;
  }

  if (args.scope.kind === 'FIRST_N_POSITIVE_DENOMINATOR_PERIODS') {
    if (!Number.isInteger(args.scope.count) || args.scope.count <= 0) return notVerified('FIRST_N_POSITIVE_DENOMINATOR_PERIODS kräver count > 0.');
    if (positive.length !== args.scope.count) return notVerified(`Endast ${positive.length} positiva denominatorperioder hittades; ${args.scope.count} krävs.`);
  }
  if (positive.length === 0) return notVerified('Ingen positiv denominatorperiod kunde verifieras.');
  return positive;
}

/**
 * Generic report-defined cost normalizer.
 *
 * The caller must explicitly supply every signed numerator term, denominator
 * identity/unit, period scope and provenance. This kernel never chooses a cost
 * definition, price deck, by-product convention, stream treatment, allocation
 * vector or cost-vintage adjustment. It is therefore safe to reuse at runtime
 * once a project has an explicit source-locked recipe.
 */
export function normalizeTier1ProjectCost(input: Tier1CostNormalizationInput): Tier1CostNormalizationResult {
  if (!nonEmpty(input.metric)) return notVerified('Cost normalization saknar metric-id.');
  if (!nonEmpty(input.reportedLabel)) return notVerified('Cost normalization saknar reportedLabel.');
  if (!Array.isArray(input.terms) || input.terms.length === 0) return notVerified('Cost normalization saknar numerator-termer.');
  if (!Array.isArray(input.denominator.series) || input.denominator.series.length === 0) return notVerified('Cost normalization saknar denominatorserie.');
  if (!nonEmpty(input.denominator.product)) return notVerified('Cost normalization saknar denominatorprodukt.');
  const denominatorProvenance = validateProvenance(input.denominator.sourceId, input.denominator.pageOrTable, 'Denominator');
  if (denominatorProvenance) return notVerified(denominatorProvenance);
  if (input.costBaseYear !== null && (!Number.isInteger(input.costBaseYear) || input.costBaseYear < 1900 || input.costBaseYear > 2100)) {
    return notVerified('costBaseYear måste vara null eller ett verifierbart kalenderår 1900–2100.');
  }

  const length = input.denominator.series.length;
  const ids = new Set<string>();
  for (const [index, term] of input.terms.entries()) {
    if (!nonEmpty(term.id)) return notVerified(`Numerator-term ${index} saknar id.`);
    if (ids.has(term.id)) return notVerified(`Cost normalization innehåller duplicate term id=${term.id}.`);
    ids.add(term.id);
    if (!nonEmpty(term.role)) return notVerified(`Numerator-term ${term.id} saknar role.`);
    if (term.operation !== 'ADD' && term.operation !== 'SUBTRACT') return notVerified(`Numerator-term ${term.id} har okänd operation.`);
    if (!Array.isArray(term.seriesUSD) || term.seriesUSD.length !== length) return notVerified(`Numerator-term ${term.id} måste ha exakt ${length} perioder.`);
    const provenance = validateProvenance(term.sourceId, term.pageOrTable, `Numerator-term ${term.id}`);
    if (provenance) return notVerified(provenance);
  }

  const selected = resolveSelectedPeriods({
    scope: input.scope,
    denominator: input.denominator.series,
    fromUnit: input.denominator.unit,
    normalizedUnit: input.denominator.normalizedUnit,
  });
  if (!Array.isArray(selected)) return selected;

  let denominatorQuantity = 0;
  for (const t of selected) {
    const raw = input.denominator.series[t];
    if (!finiteNonNegative(raw)) return notVerified(`Denominator[${t}] måste vara ett ändligt icke-negativt värde.`);
    const converted = convertDenominatorQuantity(raw, input.denominator.unit, input.denominator.normalizedUnit);
    if (!finiteNonNegative(converted)) return notVerified(`Denominator[${t}] kan inte dimensionssäkert konverteras.`);
    denominatorQuantity += converted;
  }
  if (!(denominatorQuantity > 0)) return notVerified('Vald scope ger denominator <= 0.');

  const termTrace: Tier1CostNormalizationTermTrace[] = [];
  let numeratorUSD = 0;
  for (const term of input.terms) {
    let selectedTotalUSD = 0;
    for (const t of selected) {
      const value = term.seriesUSD[t];
      if (!finiteNonNegative(value)) return notVerified(`Numerator-term ${term.id}[${t}] måste vara ett ändligt icke-negativt USD-värde.`);
      selectedTotalUSD += value;
    }
    const signedTotalUSD = term.operation === 'ADD' ? selectedTotalUSD : -selectedTotalUSD;
    numeratorUSD += signedTotalUSD;
    termTrace.push({
      id: term.id,
      role: term.role,
      operation: term.operation,
      selectedTotalUSD,
      signedTotalUSD,
      sourceId: term.sourceId,
      pageOrTable: term.pageOrTable,
    });
  }
  if (!finite(numeratorUSD)) return notVerified('Cost numerator är inte ett ändligt USD-värde.');

  const value = numeratorUSD / denominatorQuantity;
  if (!finite(value)) return notVerified('Normaliserad cost är inte ändlig.');

  let reportReconciliation: Tier1CostNormalized['reportReconciliation'] = {
    status: 'NOT_PROVIDED', checkpointValue: null, difference: null, toleranceAbs: null, sourceId: null, pageOrTable: null,
  };
  const checkpoint = input.reportCheckpoint ?? null;
  if (checkpoint) {
    if (!finite(checkpoint.value) || !finiteNonNegative(checkpoint.toleranceAbs)) return notVerified('Report checkpoint har ogiltigt value/toleranceAbs.');
    const provenance = validateProvenance(checkpoint.sourceId, checkpoint.pageOrTable, 'Report checkpoint');
    if (provenance) return notVerified(provenance);
    const difference = value - checkpoint.value;
    if (Math.abs(difference) > checkpoint.toleranceAbs) {
      return notVerified(`Report checkpoint mismatch: normalized=${value} report=${checkpoint.value} diff=${difference} tolerance=${checkpoint.toleranceAbs}.`);
    }
    reportReconciliation = {
      status: 'MATCHED', checkpointValue: checkpoint.value, difference, toleranceAbs: checkpoint.toleranceAbs,
      sourceId: checkpoint.sourceId, pageOrTable: checkpoint.pageOrTable,
    };
  }

  return {
    status: 'NORMALIZED',
    metric: input.metric,
    reportedLabel: input.reportedLabel,
    basis: input.basis,
    value,
    unit: normalizedCostUnit(input.denominator.normalizedUnit),
    numeratorUSD,
    denominator: {
      product: input.denominator.product,
      basis: input.denominator.basis,
      quantity: denominatorQuantity,
      unit: input.denominator.normalizedUnit,
      sourceId: input.denominator.sourceId,
      pageOrTable: input.denominator.pageOrTable,
    },
    selectedPeriods: selected,
    terms: termTrace,
    costBaseYear: input.costBaseYear,
    sourceConflicts: [...(input.sourceConflicts ?? [])],
    reportReconciliation,
  };
}

/**
 * Final fail-closed bridge between a normalized project metric and the exact
 * S&P Cu C1 benchmark contract. Mathematical normalization alone never grants
 * benchmark comparability.
 */
export function assessNormalizedCuC1BenchmarkReadiness(args: {
  normalized: Tier1CostNormalizationResult;
  contract?: Tier1CuC1DefinitionContract;
  hasStreams?: boolean;
}): Tier1NormalizedCuC1BenchmarkReadiness {
  const contract = args.contract ?? S_AND_P_CO_PRODUCT_C1_CU_DEFINITION;
  const blockers: string[] = [];
  const normalized = args.normalized;
  if (normalized.status !== 'NORMALIZED') {
    return { status: 'NOT_VERIFIED', blockers: [`project cost normalization: ${normalized.reason}`] };
  }

  if (normalized.metric !== contract.metric) blockers.push(`metric must be ${contract.metric}`);
  if (normalized.basis !== 'co_product') blockers.push('project cost basis must be co_product');
  if (normalized.denominator.product !== 'Cu') blockers.push('denominator product must be Cu');
  if (normalized.denominator.basis !== 'payable_primary_metal') blockers.push('denominator basis must be payable_primary_metal');
  if (normalized.denominator.unit !== 'lb' || normalized.unit !== 'USD/lb') blockers.push('denominator/output unit must be lb / USD/lb');
  if (normalized.sourceConflicts.length > 0) blockers.push('unresolved source conflicts');
  if (normalized.costBaseYear === null) blockers.push('project cost base year');
  else if (normalized.costBaseYear !== contract.benchmarkDataYear) blockers.push(`cost vintage ${normalized.costBaseYear} is not benchmark year ${contract.benchmarkDataYear}`);

  const definition = assessCuC1DefinitionReadiness(contract, { hasStreams: args.hasStreams });
  blockers.push(...definition.blockers);
  const unique = [...new Set(blockers)];
  return unique.length === 0 ? { status: 'VERIFIED', blockers: [] } : { status: 'NOT_VERIFIED', blockers: unique };
}
