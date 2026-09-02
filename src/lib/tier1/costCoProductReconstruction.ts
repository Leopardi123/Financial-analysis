import { computeProjectEngineFullProductionV1 } from '../project/engineFullProductionV1.ts';
import { resolveProjectPricesToEngineInput } from '../project/jsonv1/resolvePrices.ts';
import { parseProjectJsonV3 } from '../project/jsonv3/compile.ts';
import type { ProjectJsonV3 } from '../project/jsonv3/schema.ts';
import type { Tier1CostNormalizationResult } from './costNormalization.ts';
import { allocateTier1CoProductCost } from './costAllocation.ts';

export type Tier1CuCoProductReconstruction =
  | {
      status: 'RECONSTRUCTED';
      metric: 'C1_CU_USD_PER_LB';
      value: number;
      unit: 'USD/lb';
      costBaseYear: number | null;
      allocationMethod: 'MIXED_REVENUE_WEIGHTED';
      allocationRevenueBasis:
        | 'PUBLISHED_PRODUCT_NET_REVENUE_TABLE_22_4'
        | 'REPORT_DECK_RETAINED_PRODUCT_REVENUE_WITH_STREAM_PURCHASE';
      allocationProducts: string[];
      sourcePoolUSD: number;
      allocatedCuCostUSD: number;
      denominatorCuLb: number;
      sourceMetric: string;
      sourceValue: number;
      sourceBasis: string;
      reportSourceId: string;
      provenance: string;
      limitations: string[];
      reason: string;
    }
  | { status: 'NOT_AVAILABLE' | 'NOT_VERIFIED'; reason: string };

type ReportDeckRun = {
  output: ReturnType<typeof computeProjectEngineFullProductionV1>;
};

const BERG_CAD_TO_USD = 0.73;
const BERG_ROYALTY_CADM = [
  22.3, 27.0, 18.9, 22.6, 30.4, 24.8, 19.0, 17.9, 13.9, 16.7, 10.1, 18.2, 17.2, 11.9,
  17.9, 22.0, 20.1, 17.7, 16.7, 13.6, 18.7, 19.8, 15.3, 17.0, 13.5, 12.8, 15.9, 10.8,
] as const;
const BERG_NET_REVENUE_CADM_BY_PRODUCT = {
  Cu: [1363.6, 1751.5, 1221.0, 1501.9, 1887.5, 1320.1, 974.0, 1091.6, 801.1, 908.7, 659.6, 928.4, 985.7, 758.4, 1116.7, 1262.8, 1071.2, 940.1, 875.9, 741.5, 951.1, 927.3, 753.9, 813.1, 676.1, 606.8, 735.8, 401.6],
  Mo: [572.7, 581.6, 384.8, 433.7, 759.9, 837.2, 661.1, 457.8, 405.8, 523.3, 162.4, 592.3, 505.7, 249.3, 423.9, 658.4, 696.2, 618.4, 590.4, 426.9, 645.1, 762.9, 575.8, 711.7, 499.7, 491.4, 677.0, 568.3],
  Ag: [213.5, 270.2, 198.3, 219.8, 268.8, 230.1, 189.6, 156.3, 125.6, 176.2, 112.6, 231.1, 168.6, 110.7, 167.7, 191.8, 176.3, 158.9, 148.9, 136.5, 221.0, 234.9, 153.6, 130.7, 126.9, 129.0, 132.5, 88.3],
  Au: [80.8, 98.3, 86.6, 108.1, 119.9, 93.1, 75.8, 79.8, 59.2, 63.8, 72.1, 63.3, 64.5, 72.6, 83.0, 82.8, 66.5, 56.7, 52.3, 52.5, 57.5, 55.7, 48.8, 44.4, 48.9, 47.8, 41.6, 20.4],
} as const;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numericSeries(values: Array<number | null> | undefined, length: number, label: string): number[] | { error: string } {
  if (!values || values.length !== length) return { error: `${label} saknar exakt ${length} perioder.` };
  const out: number[] = [];
  for (let t = 0; t < length; t += 1) {
    const value = values[t];
    if (!finite(value) || value < 0) return { error: `${label}[${t}] är inte ett verifierat icke-negativt värde.` };
    out.push(value);
  }
  return out;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sumSeries(series: number[][], length: number): number[] {
  return Array.from({ length }, (_, t) => series.reduce((total, values) => total + values[t], 0));
}

async function runReportDeck(raw: ProjectJsonV3): Promise<ReportDeckRun> {
  const report = raw.verification?.report;
  if (!report) throw new Error('verification.report saknas.');
  const parsed = parseProjectJsonV3(raw, { requireRuntimePlacement: false, taxScenario: 'report', fiscalScenario: 'report' });
  const fixedPriceByKey: Record<string, number> = { ...report.priceDeckByKey };
  for (const [key, values] of Object.entries(report.priceDeckSeriesByKey ?? {})) {
    const first = values.find(finite);
    if (first !== undefined && !(key in fixedPriceByKey)) fixedPriceByKey[key] = first;
  }
  const input = await resolveProjectPricesToEngineInput({
    parsed,
    scenario: { mode: 'fixed', fixedPriceByKey },
    allowRefresh: false,
    projectId: raw.meta?.projectId ?? `tier-coproduct-${report.sourceId}`,
  });
  for (const [key, rawValues] of Object.entries(report.priceDeckSeriesByKey ?? {})) {
    const values = [...rawValues];
    input.priceSeriesByKey = input.priceSeriesByKey ?? {};
    input.priceSeriesByKey[key] = values;
    for (const [product, priceKey] of Object.entries(raw.metals.priceKeyByMetal)) {
      if (priceKey === key) input.spotPriceUSDByMetal[product] = [...values];
    }
    if (raw.metals.auPriceKey === key) input.aisc.auPriceUSDPerOz = [...values];
  }
  input.phase2.discountRate = report.discountRate;
  return { output: computeProjectEngineFullProductionV1(input) };
}

function selectedMask(normalized: Extract<Tier1CostNormalizationResult, { status: 'NORMALIZED' }>, length: number): boolean[] {
  const selected = new Set(normalized.selectedPeriods);
  return Array.from({ length }, (_, t) => selected.has(t));
}

function maskSeries(values: number[], selected: boolean[]): number[] {
  return values.map((value, t) => selected[t] ? value : 0);
}

function buildBergNetRevenueVector(length: number, selected: boolean[]): Record<string, number[]> | { error: string } {
  if (length !== 32) return { error: `Berg report-vector kräver 32 modellperioder, fick ${length}.` };
  return Object.fromEntries(Object.entries(BERG_NET_REVENUE_CADM_BY_PRODUCT).map(([product, values]) => {
    const full = [0, 0, 0, ...values, 0];
    return [product, maskSeries(full, selected)];
  }));
}

function buildWarintzaRetainedRevenueVector(
  raw: ProjectJsonV3,
  run: ReportDeckRun,
  length: number,
  selected: boolean[],
): Record<string, number[]> | { error: string } {
  const vector: Record<string, number[]> = {};
  for (const product of Object.keys(raw.metals.payableQtyByMetal)) {
    const base = numericSeries(run.output.revenue.byMetalRevenueUSD[product], length, `Warintza report-deck revenue ${product}`);
    if ('error' in base) return base;
    const streamPurchase = run.output.streams?.streamPurchaseRevenueUSDByMetal[product];
    let streamSeries = new Array<number>(length).fill(0);
    if (streamPurchase) {
      const checked = numericSeries(streamPurchase, length, `Warintza stream purchase revenue ${product}`);
      if ('error' in checked) return checked;
      streamSeries = checked;
    }
    vector[product] = maskSeries(base.map((value, t) => value + streamSeries[t]), selected);
  }
  return vector;
}

function commonPoolForSource(raw: ProjectJsonV3, run: ReportDeckRun, reportSourceId: string, selected: boolean[]): number[] | { error: string } {
  const length = raw.time.masterN + 1;
  const series: number[][] = [];

  if (reportSourceId === 'berg-pfs-2026') {
    if (raw.economics.costModel.mode !== 'AGGREGATE') return { error: 'Berg costModel måste vara AGGREGATE.' };
    if (raw.economics.sellingModel.mode !== 'AGGREGATE') return { error: 'Berg sellingModel måste vara AGGREGATE.' };
    const onsite = numericSeries(raw.economics.costModel.operatingCostsUSD, length, 'Berg onsite cost');
    const offsite = numericSeries(raw.economics.sellingModel.sellingCostsUSD, length, 'Berg offsite cost');
    if ('error' in onsite) return onsite;
    if ('error' in offsite) return offsite;
    if (length !== 32) return { error: `Berg royaltyvektor kräver 32 modellperioder, fick ${length}.` };
    const royalty = [0, 0, 0, ...BERG_ROYALTY_CADM.map((value) => value * 1_000_000 * BERG_CAD_TO_USD), 0];
    series.push(onsite, offsite, royalty);
  } else if (reportSourceId === 'warintza-pfs-2025') {
    if (raw.economics.costModel.mode !== 'COMPONENTS') return { error: 'Warintza costModel måste vara COMPONENTS.' };
    if (raw.economics.sellingModel.mode !== 'AGGREGATE') return { error: 'Warintza sellingModel måste vara AGGREGATE.' };
    for (const componentId of ['mining', 'processing', 'site_ga']) {
      const component = raw.economics.costModel.components.find((row) => row.id === componentId);
      if (!component) return { error: `Warintza cost component ${componentId} saknas.` };
      const checked = numericSeries(component.seriesUSD, length, `Warintza ${componentId}`);
      if ('error' in checked) return checked;
      series.push(checked);
    }
    const deductions = numericSeries(raw.economics.sellingModel.sellingCostsUSD, length, 'Warintza deductions');
    const royalties = numericSeries(run.output.fiscalTake?.revenueDeductionUSD, length, 'Warintza royalties');
    if ('error' in deductions) return deductions;
    if ('error' in royalties) return royalties;
    series.push(deductions, royalties);
  } else {
    return { error: `Ingen source-locked co-product common-pool adapter finns för ${reportSourceId}.` };
  }

  return maskSeries(sumSeries(series, length), selected);
}

export async function reconstructSourceLockedCuCoProductC1(args: {
  raw: ProjectJsonV3;
  recipeId: string;
  normalized: Tier1CostNormalizationResult;
}): Promise<Tier1CuCoProductReconstruction> {
  const normalized = args.normalized;
  if (normalized.status !== 'NORMALIZED') return { status: 'NOT_AVAILABLE', reason: 'Report-defined cost normalization är inte NORMALIZED.' };
  if (normalized.basis !== 'net_by_product') return { status: 'NOT_AVAILABLE', reason: `Source basis ${normalized.basis} kräver ingen by-product→co-product reconstruction i detta lager.` };
  if (!normalized.metric.includes('C1') && !normalized.metric.includes('CASH_COST')) return { status: 'NOT_AVAILABLE', reason: `Metric ${normalized.metric} är inte en C1/cash-cost source metric.` };
  if (normalized.metric.includes('AISC') || normalized.metric.includes('ALL_IN')) return { status: 'NOT_AVAILABLE', reason: `Metric ${normalized.metric} är inte C1 cash cost.` };
  if (normalized.denominator.product !== 'Cu' || normalized.denominator.basis !== 'payable_primary_metal' || normalized.denominator.unit !== 'lb' || normalized.unit !== 'USD/lb') {
    return { status: 'NOT_VERIFIED', reason: 'Co-product reconstruction kräver source-lockad payable Cu denominator i lb och USD/lb output.' };
  }
  if (normalized.sourceConflicts.length > 0) return { status: 'NOT_VERIFIED', reason: 'Source conflicts finns kvar; ingen co-product reconstruction görs.' };

  const reportSourceId = args.raw.verification?.report?.sourceId ?? null;
  if (!reportSourceId) return { status: 'NOT_VERIFIED', reason: 'verification.report.sourceId saknas.' };
  if (reportSourceId !== 'berg-pfs-2026' && reportSourceId !== 'warintza-pfs-2025') {
    return { status: 'NOT_AVAILABLE', reason: `Ingen source-locked co-product adapter finns ännu för ${reportSourceId}.` };
  }

  let run: ReportDeckRun;
  try { run = await runReportDeck(args.raw); }
  catch (error) { return { status: 'NOT_VERIFIED', reason: `Report-deck engine kunde inte köras för co-product reconstruction: ${error instanceof Error ? error.message : String(error)}` }; }

  const length = args.raw.time.masterN + 1;
  const selected = selectedMask(normalized, length);
  const pool = commonPoolForSource(args.raw, run, reportSourceId, selected);
  if ('error' in pool) return { status: 'NOT_VERIFIED', reason: pool.error };

  let revenue: Record<string, number[]> | { error: string };
  let allocationRevenueBasis: Extract<Tier1CuCoProductReconstruction, { status: 'RECONSTRUCTED' }>['allocationRevenueBasis'];
  let provenance: string;
  let limitations: string[];

  if (reportSourceId === 'berg-pfs-2026') {
    revenue = buildBergNetRevenueVector(length, selected);
    allocationRevenueBasis = 'PUBLISHED_PRODUCT_NET_REVENUE_TABLE_22_4';
    provenance = 'Berg PFS Table 22-4 pp.322-324: annual product-level net revenue Cu/Mo/Ag/Au and annual royalty; report C1 common pool from onsite + offsite + published royalty. CAD:USD 0.73 from report economic assumptions.';
    limitations = [
      'Berg allocation uses the PFS report-deck published net-revenue vector, not a verified S&P 2024 allocation vector.',
      'Berg costs are Q2 2026 constant-dollar estimates, not 2024 actual.',
      'Full current S&P C1 component boundary remains unverified.',
    ];
  } else {
    revenue = buildWarintzaRetainedRevenueVector(args.raw, run, length, selected);
    allocationRevenueBasis = 'REPORT_DECK_RETAINED_PRODUCT_REVENUE_WITH_STREAM_PURCHASE';
    provenance = 'Warintza PFS Tables 22.1/22.6/22.8 and Section 22.1.4: report-deck retained metal revenue plus explicit Royal Gold stream purchase revenue allocated to Au; common C1 pool before by-product credits.';
    limitations = [
      'Warintza allocation uses source-locked report-deck retained product revenue, not a published per-product net-revenue vector.',
      'Royal Gold stream purchase revenue is explicitly attributed to Au for this project diagnostic; S&P stream treatment remains unknown.',
      'Full current S&P C1 component boundary remains unverified.',
      'One common Warintza C1 cost base year is not source-locked.',
    ];
  }
  if ('error' in revenue && typeof revenue.error === 'string') return { status: 'NOT_VERIFIED', reason: revenue.error };
  const allocationRevenueUSDByProduct = revenue as Record<string, number[]>;

  const allocation = allocateTier1CoProductCost({
    components: [{
      id: `${reportSourceId}-source-locked-c1-common-pool`,
      category: 'other_site_opex',
      seriesUSD: pool,
      allocation: { mode: 'MIXED_REVENUE_WEIGHTED' },
    }],
    allocationRevenueUSDByProduct,
    toleranceAbsUSD: 0.01,
  });
  if (allocation.status !== 'COMPUTABLE') return { status: 'NOT_VERIFIED', reason: allocation.reason };

  const allocatedCu = allocation.allocatedCostUSDByProduct.Cu;
  if (!allocatedCu) return { status: 'NOT_VERIFIED', reason: 'Co-product allocation saknar Cu-resultat.' };
  const allocatedCuCostUSD = sum(allocatedCu);
  const sourcePoolUSD = sum(allocation.sourceCostUSD);
  const denominatorCuLb = normalized.denominator.quantity;
  if (!(denominatorCuLb > 0)) return { status: 'NOT_VERIFIED', reason: 'Payable Cu denominator <= 0.' };
  const value = allocatedCuCostUSD / denominatorCuLb;
  if (!finite(value)) return { status: 'NOT_VERIFIED', reason: 'Rekonstruerad co-product C1 är inte ändlig.' };

  return {
    status: 'RECONSTRUCTED',
    metric: 'C1_CU_USD_PER_LB',
    value,
    unit: 'USD/lb',
    costBaseYear: normalized.costBaseYear,
    allocationMethod: 'MIXED_REVENUE_WEIGHTED',
    allocationRevenueBasis,
    allocationProducts: Object.keys(allocationRevenueUSDByProduct),
    sourcePoolUSD,
    allocatedCuCostUSD,
    denominatorCuLb,
    sourceMetric: normalized.metric,
    sourceValue: normalized.value,
    sourceBasis: normalized.basis,
    reportSourceId,
    provenance,
    limitations,
    reason: `Rapportmåttet ${normalized.metric}=${normalized.value.toFixed(4)} USD/lb (${normalized.basis}) har rekonstruerats till source-locked co-product Cu C1=${value.toFixed(4)} USD/lb payable Cu via ${allocationRevenueBasis}. Detta är en projektdefinition/diagnostik, inte ett påstående om exakt S&P 2024-ekvivalens.`,
  };
}
