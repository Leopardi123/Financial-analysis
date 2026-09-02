import { computeProjectEngineFullProductionV1 } from '../project/engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../project/jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../project/jsonv3/compile.ts';
import type { ProjectJsonV3, ProjectJsonV3ReportedCostCheckpoint } from '../project/jsonv3/schema.ts';
import {
  assessNormalizedCuC1BenchmarkReadiness,
  normalizeTier1ProjectCost,
  type Tier1CostNormalizationOperation,
  type Tier1CostNormalizationResult,
  type Tier1CostNormalizationScope,
  type Tier1CostSourceConflict,
} from './costNormalization.ts';

export type Tier1CostRecipeProvenance = { sourceId: string; pageOrTable: string };
export type Tier1CostRecipeSeriesReference =
  | { kind: 'COST_COMPONENT'; componentId: string }
  | { kind: 'COST_AGGREGATE' }
  | { kind: 'SELLING_COMPONENT'; componentId: string }
  | { kind: 'SELLING_AGGREGATE' }
  | { kind: 'FISCAL_REVENUE_DEDUCTION' }
  | { kind: 'FISCAL_REPORT_LOCKED_ITEM'; itemId: string }
  | { kind: 'CAPITAL'; field: 'capexUSD' | 'sustainingCapexUSD' | 'closureUSD' }
  | { kind: 'REPORT_DECK_METAL_REVENUE'; product: string; mode: 'ENGINE_METAL_REVENUE' | 'RETAINED_SPOT_VALUE' }
  | { kind: 'STREAM_PURCHASE_REVENUE'; product: string };
export type Tier1CostRecipeDenominatorReference =
  | { kind: 'PAYABLE_PRODUCT'; product: string; normalizedUnit: 'lb' | 'tonne' | 'toz' }
  | { kind: 'METAL_IN_PRODUCT'; product: string; normalizedUnit: 'lb' | 'tonne' | 'toz' }
  | { kind: 'REPORT_DECK_METAL_EQUIVALENT'; product: string; baseProduct: string; includedProducts: string[]; normalizedUnit: 'lb' | 'tonne' | 'toz' };
export type Tier1CostRecipeTerm = {
  id: string; role: string; operation: Tier1CostNormalizationOperation;
  reference: Tier1CostRecipeSeriesReference; provenance?: Tier1CostRecipeProvenance;
};
export type Tier1CostRecipeCheckpointSelector = {
  metric: string; periodKind: 'LOM' | 'FIRST_N_OPERATING_YEARS' | 'STEADY_STATE' | 'OTHER';
  years?: number; label?: string; toleranceAbs: number;
};
export type Tier1CostRecipeScope =
  | { kind: 'ALL_PERIODS' }
  | { kind: 'POSITIVE_DENOMINATOR_PERIODS'; from: 'PRODUCTION_START' | 'ZERO' }
  | { kind: 'FIRST_N_POSITIVE_DENOMINATOR_PERIODS'; count: number; from: 'PRODUCTION_START' | 'ZERO' }
  | { kind: 'EXPLICIT_PERIODS'; periods: number[] };
export type Tier1CostNormalizationRecipe = {
  id: string; reportSourceId: string; metric: string; reportedLabel: string;
  basis: 'net_by_product' | 'co_product' | 'before_by_product' | 'reported_other' | 'unknown';
  terms: Tier1CostRecipeTerm[]; denominator: Tier1CostRecipeDenominatorReference;
  denominatorProvenance: Tier1CostRecipeProvenance; scope: Tier1CostRecipeScope;
  costBaseYear: number | null; checkpoint: Tier1CostRecipeCheckpointSelector;
  sourceConflicts?: Tier1CostSourceConflict[];
};
export type Tier1CostRecipeRun = {
  recipeId: string; reportSourceId: string; normalized: Tier1CostNormalizationResult;
  benchmarkReadiness: ReturnType<typeof assessNormalizedCuC1BenchmarkReadiness> | null;
};
export type Tier1CostRecipeBatchResult = {
  status: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NOT_VERIFIED'; reportSourceId: string | null;
  runs: Tier1CostRecipeRun[]; reason: string;
};

type ReportDeckRun = {
  input: Awaited<ReturnType<typeof resolveProjectPricesToEngineInput>>;
  output: ReturnType<typeof computeProjectEngineFullProductionV1>;
};
type ResolvedSeries = { seriesUSD: Array<number | null>; provenance: Tier1CostRecipeProvenance } | { error: string };
type ResolvedDenominator = {
  product: string; basis: 'payable_primary_metal' | 'produced_primary_metal' | 'metal_equivalent';
  series: Array<number | null>; unit: string; normalizedUnit: 'lb' | 'tonne' | 'toz';
} | { error: string };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const fail = (reason: string): Tier1CostNormalizationResult => ({ status: 'NOT_VERIFIED', reason });
const p = (sourceId: string, pageOrTable: string): Tier1CostRecipeProvenance => ({ sourceId, pageOrTable });
const add = (id: string, role: string, reference: Tier1CostRecipeSeriesReference, provenance?: Tier1CostRecipeProvenance): Tier1CostRecipeTerm => ({ id, role, operation: 'ADD', reference, provenance });
const sub = (id: string, role: string, reference: Tier1CostRecipeSeriesReference, provenance?: Tier1CostRecipeProvenance): Tier1CostRecipeTerm => ({ id, role, operation: 'SUBTRACT', reference, provenance });

function sumSeries(seriesList: Array<Array<number | null>>, length: number): Array<number | null> {
  return Array.from({ length }, (_, t) => {
    let total = 0;
    for (const series of seriesList) { const value = series[t]; if (!finite(value)) return null; total += value; }
    return total;
  });
}

async function runReportDeckEngine(raw: ProjectJsonV3): Promise<ReportDeckRun> {
  const report = raw.verification?.report;
  if (!report) throw new Error('verification.report saknas.');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const fixedPriceByKey: Record<string, number> = { ...report.priceDeckByKey };
  for (const [key, values] of Object.entries(report.priceDeckSeriesByKey ?? {})) {
    const first = values.find(finite);
    if (first !== undefined && !(key in fixedPriceByKey)) fixedPriceByKey[key] = first;
  }
  const input = await resolveProjectPricesToEngineInput({ parsed, scenario: { mode: 'fixed', fixedPriceByKey }, allowRefresh: false, projectId: raw.meta?.projectId ?? `tier-cost-recipe-${report.sourceId}` });
  for (const [key, rawValues] of Object.entries(report.priceDeckSeriesByKey ?? {})) {
    const values = [...rawValues];
    input.priceSeriesByKey = input.priceSeriesByKey ?? {};
    input.priceSeriesByKey[key] = values;
    for (const [product, priceKey] of Object.entries(raw.metals.priceKeyByMetal)) if (priceKey === key) input.spotPriceUSDByMetal[product] = [...values];
    if (raw.metals.auPriceKey === key) input.aisc.auPriceUSDPerOz = [...values];
  }
  input.phase2.discountRate = report.discountRate;
  return { input, output: computeProjectEngineFullProductionV1(input) };
}

function provenance(explicit: Tier1CostRecipeProvenance | undefined, sourceId?: string | null, pageOrTable?: string | null): Tier1CostRecipeProvenance | null {
  if (explicit && nonEmpty(explicit.sourceId) && nonEmpty(explicit.pageOrTable)) return explicit;
  return nonEmpty(sourceId) && nonEmpty(pageOrTable) ? { sourceId, pageOrTable } : null;
}

function resolveSeries(raw: ProjectJsonV3, run: ReportDeckRun, term: Tier1CostRecipeTerm): ResolvedSeries {
  const ref = term.reference;
  const length = raw.time.masterN + 1;
  if (ref.kind === 'COST_COMPONENT') {
    if (raw.economics.costModel.mode !== 'COMPONENTS') return { error: `${term.id}: costModel är inte COMPONENTS.` };
    const row = raw.economics.costModel.components.find((item) => item.id === ref.componentId);
    if (!row) return { error: `${term.id}: cost component ${ref.componentId} saknas.` };
    const src = provenance(term.provenance, row.sourceId, row.pageOrTable);
    return src ? { seriesUSD: [...row.seriesUSD], provenance: src } : { error: `${term.id}: cost component saknar provenance.` };
  }
  if (ref.kind === 'COST_AGGREGATE') {
    if (raw.economics.costModel.mode !== 'AGGREGATE') return { error: `${term.id}: costModel är inte AGGREGATE.` };
    return term.provenance ? { seriesUSD: [...raw.economics.costModel.operatingCostsUSD], provenance: term.provenance } : { error: `${term.id}: aggregate cost kräver explicit provenance.` };
  }
  if (ref.kind === 'SELLING_COMPONENT') {
    if (raw.economics.sellingModel.mode !== 'COMPONENTS') return { error: `${term.id}: sellingModel är inte COMPONENTS.` };
    const row = raw.economics.sellingModel.components.find((item) => item.id === ref.componentId);
    if (!row) return { error: `${term.id}: selling component ${ref.componentId} saknas.` };
    const src = provenance(term.provenance, row.sourceId, row.pageOrTable);
    return src ? { seriesUSD: [...row.seriesUSD], provenance: src } : { error: `${term.id}: selling component saknar provenance.` };
  }
  if (ref.kind === 'SELLING_AGGREGATE') {
    if (raw.economics.sellingModel.mode !== 'AGGREGATE') return { error: `${term.id}: sellingModel är inte AGGREGATE.` };
    return term.provenance ? { seriesUSD: [...raw.economics.sellingModel.sellingCostsUSD], provenance: term.provenance } : { error: `${term.id}: aggregate selling cost kräver explicit provenance.` };
  }
  if (ref.kind === 'FISCAL_REVENUE_DEDUCTION') {
    const seriesUSD = run.output.fiscalTake?.revenueDeductionUSD;
    return seriesUSD && seriesUSD.length === length && term.provenance ? { seriesUSD: [...seriesUSD], provenance: term.provenance } : { error: `${term.id}: report-deck fiscal revenue deduction/provenance saknas.` };
  }
  if (ref.kind === 'FISCAL_REPORT_LOCKED_ITEM') {
    if (raw.economics.fiscalTakeModel.mode !== 'RULES') return { error: `${term.id}: fiscalTakeModel är inte RULES.` };
    const row = raw.economics.fiscalTakeModel.reportLockedItems?.find((item) => item.id === ref.itemId);
    if (!row || row.placement !== 'REVENUE_DEDUCTION') return { error: `${term.id}: report-locked revenue-deduction ${ref.itemId} saknas.` };
    const src = provenance(term.provenance, row.sourceId, row.pageOrTable);
    return src ? { seriesUSD: [...row.reportFiscalTakeUSD], provenance: src } : { error: `${term.id}: report-locked fiscal item saknar provenance.` };
  }
  if (ref.kind === 'CAPITAL') {
    const seriesUSD = raw.capital[ref.field];
    return Array.isArray(seriesUSD) && seriesUSD.length === length && term.provenance ? { seriesUSD: [...seriesUSD], provenance: term.provenance } : { error: `${term.id}: capital.${ref.field}/provenance saknas.` };
  }
  if (ref.kind === 'REPORT_DECK_METAL_REVENUE') {
    let seriesUSD: Array<number | null> | undefined;
    if (ref.mode === 'ENGINE_METAL_REVENUE') seriesUSD = run.output.revenue.byMetalRevenueUSD[ref.product];
    else {
      const prices = run.input.spotPriceUSDByMetal[ref.product];
      const qty = run.output.streams?.effectivePayableQtyByMetal[ref.product] ?? raw.metals.payableQtyByMetal[ref.product];
      if (prices && qty && prices.length === length && qty.length === length) seriesUSD = Array.from({ length }, (_, t) => finite(prices[t]) && finite(qty[t]) ? (prices[t] as number) * (qty[t] as number) : null);
    }
    return seriesUSD && seriesUSD.length === length && term.provenance ? { seriesUSD: [...seriesUSD], provenance: term.provenance } : { error: `${term.id}: report-deck revenue/provenance saknas för ${ref.product}.` };
  }
  const seriesUSD = run.output.streams?.streamPurchaseRevenueUSDByMetal[ref.product];
  return seriesUSD && seriesUSD.length === length && term.provenance ? { seriesUSD: [...seriesUSD], provenance: term.provenance } : { error: `${term.id}: stream purchase revenue/provenance saknas för ${ref.product}.` };
}

function resolveDenominator(raw: ProjectJsonV3, run: ReportDeckRun, recipe: Tier1CostNormalizationRecipe): ResolvedDenominator {
  const ref = recipe.denominator;
  const length = raw.time.masterN + 1;
  if (ref.kind === 'PAYABLE_PRODUCT') {
    const series = raw.metals.payableQtyByMetal[ref.product], unit = raw.metals.payableQtyUnitByMetal[ref.product];
    return series && unit && series.length === length ? { product: ref.product, basis: 'payable_primary_metal', series: [...series], unit, normalizedUnit: ref.normalizedUnit } : { error: `${recipe.id}: payable denominator saknas för ${ref.product}.` };
  }
  if (ref.kind === 'METAL_IN_PRODUCT') {
    const series = raw.metals.metalInProductQtyByMetal?.[ref.product], unit = raw.metals.payableQtyUnitByMetal[ref.product];
    return series && unit && series.length === length ? { product: ref.product, basis: 'produced_primary_metal', series: [...series], unit, normalizedUnit: ref.normalizedUnit } : { error: `${recipe.id}: metal-in-product denominator saknas för ${ref.product}.` };
  }
  if (raw.streamsByMetal && ref.includedProducts.some((product) => raw.streamsByMetal?.[product])) return { error: `${recipe.id}: metal-equivalent denominator får inte implicit inkludera streamed products.` };
  const basePrice = run.input.spotPriceUSDByMetal[ref.baseProduct], unit = raw.metals.payableQtyUnitByMetal[ref.baseProduct];
  if (!basePrice || !unit || basePrice.length !== length) return { error: `${recipe.id}: base price/unit saknas för ${ref.baseProduct}.` };
  const revenues: Array<Array<number | null>> = [];
  for (const product of ref.includedProducts) {
    const series = run.output.revenue.byMetalRevenueUSD[product];
    if (!series || series.length !== length) return { error: `${recipe.id}: report-deck revenue saknas för ${product}.` };
    revenues.push(series);
  }
  const totalRevenue = sumSeries(revenues, length);
  const series = totalRevenue.map((revenue, t) => finite(revenue) && finite(basePrice[t]) && (basePrice[t] as number) > 0 ? (revenue as number) / (basePrice[t] as number) : null);
  return { product: ref.product, basis: 'metal_equivalent', series, unit, normalizedUnit: ref.normalizedUnit };
}

function scope(raw: ProjectJsonV3, value: Tier1CostRecipeScope): Tier1CostNormalizationScope {
  if (value.kind === 'ALL_PERIODS' || value.kind === 'EXPLICIT_PERIODS') return value;
  const fromPeriod = value.from === 'PRODUCTION_START' ? raw.time.productionStartPeriod : 0;
  return value.kind === 'POSITIVE_DENOMINATOR_PERIODS' ? { kind: value.kind, fromPeriod } : { kind: value.kind, count: value.count, fromPeriod };
}
function checkpointMatches(row: ProjectJsonV3ReportedCostCheckpoint, selector: Tier1CostRecipeCheckpointSelector): boolean {
  if (row.metric !== selector.metric || !row.period || row.period.kind !== selector.periodKind) return false;
  if (row.period.kind === 'FIRST_N_OPERATING_YEARS') return row.period.years === selector.years;
  if (row.period.kind === 'OTHER') return row.period.label === selector.label;
  return true;
}
function checkpoint(raw: ProjectJsonV3, recipe: Tier1CostNormalizationRecipe): ProjectJsonV3ReportedCostCheckpoint | null {
  const matches = (raw.verification?.reportedCostCheckpoints ?? []).filter((row) => checkpointMatches(row, recipe.checkpoint));
  return matches.length === 1 ? matches[0] : null;
}

const V = 'vizcachitas-pfs-2023', B = 'berg-pfs-2026', W = 'warintza-pfs-2025', A = 'arctic-fs-2023', C = 'copper-creek-pea-2023';
const vizTerms = [add('mining_opex', 'mining', { kind: 'COST_COMPONENT', componentId: 'mining_opex' }), add('processing_opex', 'processing', { kind: 'COST_COMPONENT', componentId: 'processing_opex' })];
const bergPool = [add('operating_cost', 'onsite_cost', { kind: 'COST_AGGREGATE' }, p(B, 'Table 22-4 pp.323-325')), add('offsite_cost', 'offsite_cost', { kind: 'SELLING_AGGREGATE' }, p(B, 'Table 22-4 pp.323-325')), add('royalty', 'royalty', { kind: 'FISCAL_REVENUE_DEDUCTION' }, p(B, 'Section 22.3.4 p.319; Table 22-4 pp.323-324'))];
const reportRevenue = (sourceId: string, product: string, page: string, mode: 'ENGINE_METAL_REVENUE' | 'RETAINED_SPOT_VALUE' = 'ENGINE_METAL_REVENUE') => sub(`${product.toLowerCase()}_credit`, 'by_product_credit', { kind: 'REPORT_DECK_METAL_REVENUE', product, mode }, p(sourceId, page));
const warintzaBase = [
  add('mining', 'mining', { kind: 'COST_COMPONENT', componentId: 'mining' }), add('processing', 'processing', { kind: 'COST_COMPONENT', componentId: 'processing' }), add('site_ga', 'site_ga', { kind: 'COST_COMPONENT', componentId: 'site_ga' }),
  add('deductions', 'tcrc_deductions', { kind: 'SELLING_AGGREGATE' }, p(W, 'Table 22.8 pp.350-351')), add('royalties', 'royalty', { kind: 'FISCAL_REVENUE_DEDUCTION' }, p(W, 'Sections 22.1.4.1-22.1.4.3 p.344; Table 22.8 pp.350-351')),
  sub('stream_purchase_revenue', 'stream_purchase_revenue', { kind: 'STREAM_PURCHASE_REVENUE', product: 'Au' }, p(W, 'Section 22.1.4.1 p.344; Table 22.8 pp.350-351')),
  reportRevenue(W, 'Au', 'Tables 22.1 and 22.6-22.8 pp.342,347-351', 'RETAINED_SPOT_VALUE'), reportRevenue(W, 'Ag', 'Tables 22.1 and 22.6-22.8 pp.342,347-351'), reportRevenue(W, 'Mo', 'Tables 22.1 and 22.6-22.8 pp.342,347-351'),
];
const arcticBase = [
  ...['mining', 'processing', 'water_treatment', 'site_ga', 'road_toll'].map((id) => add(id, id, { kind: 'COST_COMPONENT', componentId: id })),
  add('offsite', 'offsite_cost', { kind: 'SELLING_AGGREGATE' }, p(A, 'Table 22-2 pp.390-391; Table 22-4 pp.393-394')),
  ...['Pb', 'Zn', 'Au', 'Ag'].map((product) => reportRevenue(A, product, 'Section 19.2; Table 19-1 p.324; Table 22-2 pp.390-391')),
];
const copperCash = [
  ...['mine', 'mill_non_oxide', 'mill_oxide', 'ga'].map((id) => add(id, id, { kind: 'COST_COMPONENT', componentId: id })),
  ...['tcrc_penalties', 'transport'].map((id) => add(id, 'offsite_cost', { kind: 'SELLING_COMPONENT', componentId: id })),
  reportRevenue(C, 'Ag', 'Table 22-1 p.348; Table 22-3 pp.353-354'), reportRevenue(C, 'Mo', 'Table 22-1 p.348; Table 22-3 pp.353-354'),
];

export const TIER1_COST_NORMALIZATION_RECIPES: readonly Tier1CostNormalizationRecipe[] = [
  { id: 'vizcachitas-c1-first8', reportSourceId: V, metric: 'C1_CU_PRODUCED_USD_PER_LB', reportedLabel: 'C1 Cost', basis: 'reported_other', terms: vizTerms, denominator: { kind: 'METAL_IN_PRODUCT', product: 'Cu', normalizedUnit: 'lb' }, denominatorProvenance: p(V, 'Table 22.7 pp.359-362'), scope: { kind: 'FIRST_N_POSITIVE_DENOMINATOR_PERIODS', count: 8, from: 'PRODUCTION_START' }, costBaseYear: 2023, checkpoint: { metric: 'C1', periodKind: 'FIRST_N_OPERATING_YEARS', years: 8, toleranceAbs: 0.01 } },
  { id: 'vizcachitas-c1-lom', reportSourceId: V, metric: 'C1_CU_PRODUCED_USD_PER_LB', reportedLabel: 'C1 Cost', basis: 'reported_other', terms: vizTerms, denominator: { kind: 'METAL_IN_PRODUCT', product: 'Cu', normalizedUnit: 'lb' }, denominatorProvenance: p(V, 'Table 22.7 pp.359-362'), scope: { kind: 'POSITIVE_DENOMINATOR_PERIODS', from: 'PRODUCTION_START' }, costBaseYear: 2023, checkpoint: { metric: 'C1', periodKind: 'LOM', toleranceAbs: 0.01 } },
  { id: 'berg-c1-by-product-lom', reportSourceId: B, metric: 'C1_CU_BY_PRODUCT_USD_PER_LB', reportedLabel: 'C1 cost – by-product basis', basis: 'net_by_product', terms: [...bergPool, ...['Mo', 'Ag', 'Au'].map((product) => reportRevenue(B, product, 'Tables 22-3 and 22-4 pp.321-325'))], denominator: { kind: 'PAYABLE_PRODUCT', product: 'Cu', normalizedUnit: 'lb' }, denominatorProvenance: p(B, 'Tables 22-3 and 22-4 pp.321-325'), scope: { kind: 'POSITIVE_DENOMINATOR_PERIODS', from: 'PRODUCTION_START' }, costBaseYear: 2026, checkpoint: { metric: 'C1_CU_BY_PRODUCT_USD_PER_LB', periodKind: 'LOM', toleranceAbs: 0.02 } },
  { id: 'berg-c1-cueq-co-product-lom', reportSourceId: B, metric: 'C1_CUEQ_CO_PRODUCT_USD_PER_LB', reportedLabel: 'C1 cost – co-product basis', basis: 'co_product', terms: bergPool, denominator: { kind: 'REPORT_DECK_METAL_EQUIVALENT', product: 'CuEq', baseProduct: 'Cu', includedProducts: ['Cu', 'Mo', 'Ag', 'Au'], normalizedUnit: 'lb' }, denominatorProvenance: p(B, 'Tables 22-3 and 22-4 pp.321-325'), scope: { kind: 'POSITIVE_DENOMINATOR_PERIODS', from: 'PRODUCTION_START' }, costBaseYear: 2026, checkpoint: { metric: 'C1_CUEQ_CO_PRODUCT_USD_PER_LB', periodKind: 'LOM', toleranceAbs: 0.02 } },
  { id: 'warintza-c1-lom', reportSourceId: W, metric: 'C1_CU_USD_PER_LB', reportedLabel: 'C1 Cash cost', basis: 'net_by_product', terms: warintzaBase, denominator: { kind: 'PAYABLE_PRODUCT', product: 'Cu', normalizedUnit: 'lb' }, denominatorProvenance: p(W, 'Table 22.6; Table 22.8 pp.350-351'), scope: { kind: 'POSITIVE_DENOMINATOR_PERIODS', from: 'PRODUCTION_START' }, costBaseYear: null, checkpoint: { metric: 'C1_CU_USD_PER_LB', periodKind: 'LOM', toleranceAbs: 0.02 } },
  { id: 'warintza-aisc-lom', reportSourceId: W, metric: 'AISC_CU_USD_PER_LB', reportedLabel: 'C1 + sustaining', basis: 'net_by_product', terms: [...warintzaBase, add('sustaining', 'sustaining_capex', { kind: 'CAPITAL', field: 'sustainingCapexUSD' }, p(W, 'Table 22.6; Table 22.8 pp.350-351'))], denominator: { kind: 'PAYABLE_PRODUCT', product: 'Cu', normalizedUnit: 'lb' }, denominatorProvenance: p(W, 'Table 22.6; Table 22.8 pp.350-351'), scope: { kind: 'POSITIVE_DENOMINATOR_PERIODS', from: 'PRODUCTION_START' }, costBaseYear: null, checkpoint: { metric: 'AISC_CU_USD_PER_LB', periodKind: 'LOM', toleranceAbs: 0.02 } },
  { id: 'arctic-cash-cost-lom', reportSourceId: A, metric: 'CASH_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB', reportedLabel: 'Cash Costs, Net of By-product Credits', basis: 'net_by_product', terms: arcticBase, denominator: { kind: 'PAYABLE_PRODUCT', product: 'Cu', normalizedUnit: 'lb' }, denominatorProvenance: p(A, 'Table 22-2 pp.390-391; Table 22-4 pp.393-394'), scope: { kind: 'POSITIVE_DENOMINATOR_PERIODS', from: 'PRODUCTION_START' }, costBaseYear: null, checkpoint: { metric: 'CASH_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB', periodKind: 'LOM', toleranceAbs: 0.02 } },
  { id: 'arctic-all-in-cost-lom', reportSourceId: A, metric: 'ALL_IN_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB', reportedLabel: 'All-in Cost, Net of By-product Credits', basis: 'net_by_product', terms: [...arcticBase, add('initial_capex', 'report_total_capital', { kind: 'CAPITAL', field: 'capexUSD' }, p(A, 'Table 22-2 pp.390-391')), add('sustaining_capex', 'report_total_capital', { kind: 'CAPITAL', field: 'sustainingCapexUSD' }, p(A, 'Table 22-2 pp.390-391')), add('closure', 'report_total_capital', { kind: 'CAPITAL', field: 'closureUSD' }, p(A, 'Table 22-2 pp.390-391'))], denominator: { kind: 'PAYABLE_PRODUCT', product: 'Cu', normalizedUnit: 'lb' }, denominatorProvenance: p(A, 'Table 22-2 pp.390-391; Table 22-4 pp.393-394'), scope: { kind: 'ALL_PERIODS' }, costBaseYear: null, checkpoint: { metric: 'ALL_IN_COST_NET_BY_PRODUCT_CU_PAYABLE_USD_PER_LB', periodKind: 'LOM', toleranceAbs: 0.02 } },
  { id: 'copper-creek-cash-cost-lom', reportSourceId: C, metric: 'CASH_COST_BY_PRODUCT_CU_USD_PER_LB', reportedLabel: 'Cash Cost (By-Product Basis)', basis: 'net_by_product', terms: copperCash, denominator: { kind: 'PAYABLE_PRODUCT', product: 'Cu', normalizedUnit: 'lb' }, denominatorProvenance: p(C, 'Table 22-3 pp.353-354'), scope: { kind: 'POSITIVE_DENOMINATOR_PERIODS', from: 'PRODUCTION_START' }, costBaseYear: 2023, checkpoint: { metric: 'CASH_COST_BY_PRODUCT_CU_USD_PER_LB', periodKind: 'LOM', toleranceAbs: 0.02 }, sourceConflicts: [{ code: 'ROYALTY_CASH_COST_BOUNDARY', description: 'Table 22-1 footnote says royalties are in cash cost; Table 22-3 arithmetic places royalties outside the 1.67 cash-cost numerator.', sourceId: C, pageOrTable: 'Table 22-1 pp.348-349; Table 22-3 pp.353-354' }] },
  { id: 'copper-creek-aisc-lom', reportSourceId: C, metric: 'AISC_CU_BY_PRODUCT_USD_PER_LB', reportedLabel: 'All-in Sustaining Cost (AISC)', basis: 'net_by_product', terms: [...copperCash, add('royalties', 'royalty', { kind: 'FISCAL_REPORT_LOCKED_ITEM', itemId: 'combined_south32_franco_royalties' }, p(C, 'Table 22-1 pp.348-349; Table 22-3 pp.353-354')), add('sustaining', 'sustaining_capex', { kind: 'CAPITAL', field: 'sustainingCapexUSD' }, p(C, 'Table 22-3 pp.353-354')), add('closure', 'closure', { kind: 'CAPITAL', field: 'closureUSD' }, p(C, 'Table 22-3 pp.353-354'))], denominator: { kind: 'PAYABLE_PRODUCT', product: 'Cu', normalizedUnit: 'lb' }, denominatorProvenance: p(C, 'Table 22-3 pp.353-354'), scope: { kind: 'ALL_PERIODS' }, costBaseYear: 2023, checkpoint: { metric: 'AISC_CU_BY_PRODUCT_USD_PER_LB', periodKind: 'LOM', toleranceAbs: 0.02 } },
] as const;

export function recipesForReportSource(reportSourceId: string): readonly Tier1CostNormalizationRecipe[] {
  return TIER1_COST_NORMALIZATION_RECIPES.filter((recipe) => recipe.reportSourceId === reportSourceId);
}

async function runRecipe(raw: ProjectJsonV3, run: ReportDeckRun, recipe: Tier1CostNormalizationRecipe): Promise<Tier1CostRecipeRun> {
  if (raw.verification?.report?.sourceId !== recipe.reportSourceId) return { recipeId: recipe.id, reportSourceId: recipe.reportSourceId, normalized: fail(`${recipe.id}: sourceId mismatch.`), benchmarkReadiness: null };
  const reportCheckpoint = checkpoint(raw, recipe);
  if (!reportCheckpoint) return { recipeId: recipe.id, reportSourceId: recipe.reportSourceId, normalized: fail(`${recipe.id}: exakt report checkpoint kunde inte lösas entydigt.`), benchmarkReadiness: null };
  const denominator = resolveDenominator(raw, run, recipe);
  if ('error' in denominator) return { recipeId: recipe.id, reportSourceId: recipe.reportSourceId, normalized: fail(denominator.error), benchmarkReadiness: null };
  const terms = [];
  for (const term of recipe.terms) {
    const resolved = resolveSeries(raw, run, term);
    if ('error' in resolved) return { recipeId: recipe.id, reportSourceId: recipe.reportSourceId, normalized: fail(resolved.error), benchmarkReadiness: null };
    terms.push({ id: term.id, role: term.role, operation: term.operation, seriesUSD: resolved.seriesUSD, ...resolved.provenance });
  }
  const normalized = normalizeTier1ProjectCost({ metric: recipe.metric, reportedLabel: recipe.reportedLabel, basis: recipe.basis, terms, denominator: { ...denominator, ...recipe.denominatorProvenance }, scope: scope(raw, recipe.scope), costBaseYear: recipe.costBaseYear, sourceConflicts: recipe.sourceConflicts, reportCheckpoint: { value: reportCheckpoint.value, toleranceAbs: recipe.checkpoint.toleranceAbs, sourceId: reportCheckpoint.sourceId, pageOrTable: reportCheckpoint.pageOrTable } });
  const benchmarkReadiness = normalized.status === 'NORMALIZED' ? assessNormalizedCuC1BenchmarkReadiness({ normalized, hasStreams: Boolean(raw.streamsByMetal && Object.keys(raw.streamsByMetal).length > 0) }) : null;
  return { recipeId: recipe.id, reportSourceId: recipe.reportSourceId, normalized, benchmarkReadiness };
}

export async function runTier1CostNormalizationRecipes(raw: ProjectJsonV3): Promise<Tier1CostRecipeBatchResult> {
  const reportSourceId = raw.verification?.report?.sourceId ?? null;
  if (!reportSourceId) return { status: 'NOT_AVAILABLE', reportSourceId: null, runs: [], reason: 'verification.report.sourceId saknas; ingen source-locked cost recipe kan väljas.' };
  const recipes = recipesForReportSource(reportSourceId);
  if (recipes.length === 0) return { status: 'NOT_AVAILABLE', reportSourceId, runs: [], reason: `Ingen source-locked cost recipe finns för ${reportSourceId}.` };
  let reportDeckRun: ReportDeckRun;
  try { reportDeckRun = await runReportDeckEngine(raw); }
  catch (error) { return { status: 'NOT_VERIFIED', reportSourceId, runs: [], reason: `Report-deck engine kunde inte köras: ${error instanceof Error ? error.message : String(error)}` }; }
  const runs: Tier1CostRecipeRun[] = [];
  for (const recipe of recipes) runs.push(await runRecipe(raw, reportDeckRun, recipe));
  const failed = runs.filter((row) => row.normalized.status !== 'NORMALIZED');
  return { status: failed.length === 0 ? 'AVAILABLE' : 'NOT_VERIFIED', reportSourceId, runs, reason: failed.length === 0 ? `${runs.length} source-locked cost recipe(s) normaliserades från canonical Project-ekonomi.` : `${failed.length}/${runs.length} cost recipe(s) kunde inte verifieras; misslyckade resultat är inte benchmark input.` };
}
