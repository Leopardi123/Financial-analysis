import type { CorporateSnapshot } from './snapshot/types.ts';
import { getPriceKeyDefinition } from '../prices/keys.ts';
import { UNIT_CONSTANTS } from '../prices/units/types.ts';
import { canonicalUnitForMetal } from '../units/metalUnits.ts';
import { convertPriceToCanonical } from '../units/conversion.ts';
import {
  computePreRevenuePNavPostFinancing,
  computePreRevenuePeakSixTimesValuePerShare,
  normalizeManualExtraShares,
  preRevenueExtraShareScale,
  preRevenuePostFinancingShares,
} from './preRevenueValuation.ts';

export type CorporateSnapshotWithValuationSeries = CorporateSnapshot & {
  corporateValuationTimeSeries?: {
    rows?: Array<{ year?: number; evEbitda6xPerShare?: number | null }>;
  };
};

export type EquivalentMetalMetrics = {
  metal: string;
  unit: 'oz' | 't';
  series: Array<number | null>;
  annualEq: number | null;
  tenYearEq: number | null;
  lomEq: number | null;
  productionYears: number | null;
  priceKey: string | null;
  priceUnit: string | null;
  status: 'OK' | 'MISSING_REVENUE' | 'MISSING_PRICE' | 'INVALID_SERIES';
  diagnostic: string | null;
};

export type CorporatePreRevenueReferenceMetalMetrics = {
  metal: string;
  unit: 'oz' | 't';
  capexPerAnnualEqUSD: number | null;
  lomEqPerShare: number | null;
  marketCapPerTenYearEqUSD: number | null;
  marketCapPerLomEqUSD: number | null;
  evPerLomEqUSD: number | null;
};

export type CorporatePreRevenueMetrics = {
  irr: number | null;
  paybackYears: number | null;
  lomYears: number | null;
  initialCapexUSD: number | null;
  sharesPostFinancing: number | null;
  marketCapUSD: number | null;
  enterpriseValueUSD: number | null;
  pNavPostFinancing: number | null;
  peak6xValuePerShare: number | null;
  peak6xOverCurrentPrice: number | null;
  nextProjectMarkerYear: number | null;
  targetPrice: number | null;
  targetOverCurrentPrice: number | null;
  annualizedReturnToTarget: number | null;
  equivalentByMetal: Record<string, EquivalentMetalMetrics>;
  byReferenceMetal: Record<string, CorporatePreRevenueReferenceMetalMetrics>;
  diagnostics: string[];
};

type ValuationMarker = NonNullable<CorporateSnapshot['modeledValuationTimeline']>['markers'][number];

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const readFinite = (value: unknown): number | null => finite(value) ? value : null;

function metalRecordValue<T>(record: Record<string, T> | undefined, metal: string): T | undefined {
  if (!record) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, metal)) return record[metal];
  const normalized = metal.trim().toLowerCase();
  const key = Object.keys(record).find((candidate) => candidate.trim().toLowerCase() === normalized);
  return key === undefined ? undefined : record[key];
}

function outputEqUnitAndDivisor(metal: string): { unit: 'oz' | 't'; divisor: number } {
  const canonicalQtyUnit = canonicalUnitForMetal(metal);
  if (canonicalQtyUnit === 'toz') return { unit: 'oz', divisor: 1 };
  if (canonicalQtyUnit === 'lb') return { unit: 't', divisor: UNIT_CONSTANTS.LB_PER_TONNE };
  return { unit: 't', divisor: 1 };
}

function markerYear(marker: ValuationMarker | null | undefined): number | null {
  if (!marker) return null;
  const raw = marker.yearLabelUsed;
  if (finite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validValuationMarkers(snapshot: CorporateSnapshotWithValuationSeries): ValuationMarker[] {
  const markers = snapshot.modeledValuationTimeline?.markers;
  return Array.isArray(markers)
    ? markers.filter((marker) => markerYear(marker) !== null && finite(marker.value_low) && finite(marker.value_high))
    : [];
}

function nextRelevantProjectMarker(snapshot: CorporateSnapshotWithValuationSeries, valuationYear: number): ValuationMarker | null {
  return validValuationMarkers(snapshot)
    .sort((a, b) => (markerYear(a) ?? Infinity) - (markerYear(b) ?? Infinity))
    .find((marker) => (markerYear(marker) ?? -Infinity) > valuationYear) ?? null;
}

function canonicalMarkerTarget(marker: ValuationMarker | null): number | null {
  if (!marker) return null;
  if (finite(marker.value_mid_if_any)) return marker.value_mid_if_any;
  return finite(marker.value_low) && finite(marker.value_high) ? (marker.value_low + marker.value_high) / 2 : null;
}

function targetCurrencyToUsd(snapshot: CorporateSnapshotWithValuationSeries, value: number | null): number | null {
  if (!finite(value)) return null;
  const fx = readFinite(snapshot.fx_USD_to_TargetCurrency);
  if (!finite(fx) || fx <= 0) return null;
  return value / fx;
}

function canonicalProductionYears(snapshot: CorporateSnapshotWithValuationSeries): number | null {
  const payable = snapshot.aggregation?.payableAuEqOz_total;
  if (!Array.isArray(payable)) return null;
  const count = payable.filter((value) => finite(value) && value > 0).length;
  return count > 0 ? count : null;
}

function candidateMetals(snapshot: CorporateSnapshotWithValuationSeries, requested?: string[]): string[] {
  const metals = new Set<string>();
  for (const metal of requested ?? []) if (metal.trim()) metals.add(metal.trim());
  for (const record of [
    snapshot.series?.payableQtyByMetal,
    snapshot.series?.priceUsedByMetal_USD,
    snapshot.aggregation?.priceKeyByMetal,
    snapshot.aggregation?.priceUSDByMetal,
  ]) {
    if (record && typeof record === 'object') for (const metal of Object.keys(record)) metals.add(metal);
  }
  if (Array.isArray(snapshot.aggregation?.auPriceUSDPerOz)) metals.add('Au');
  return [...metals].sort((a, b) => a.localeCompare(b));
}

export function deriveEquivalentMetalMetrics(
  snapshot: CorporateSnapshotWithValuationSeries,
  metal: string,
): EquivalentMetalMetrics {
  const revenue = snapshot.series?.totalRevenue_USD ?? snapshot.aggregation?.grossRevenueUSD_total;
  const display = outputEqUnitAndDivisor(metal);
  const priceKey = metalRecordValue(snapshot.aggregation?.priceKeyByMetal, metal) ?? null;
  if (!Array.isArray(revenue)) {
    return { metal, unit: display.unit, series: [], annualEq: null, tenYearEq: null, lomEq: null, productionYears: null, priceKey, priceUnit: null, status: 'MISSING_REVENUE', diagnostic: 'Corporate total revenue series is unavailable.' };
  }

  const seriesPrices = metalRecordValue(snapshot.series?.priceUsedByMetal_USD, metal);
  const unitAudit = metalRecordValue(snapshot.series?.unitAudit?.metals, metal);
  let prices: Array<number | null> | undefined;
  let priceUnit: string | null = null;

  if (Array.isArray(seriesPrices) && unitAudit?.priceUnit) {
    prices = seriesPrices;
    priceUnit = unitAudit.priceUnit;
  } else {
    prices = metalRecordValue(snapshot.aggregation?.priceUSDByMetal, metal)
      ?? (metal.trim().toLowerCase() === 'au' ? snapshot.aggregation?.auPriceUSDPerOz : undefined);
    try {
      priceUnit = priceKey
        ? getPriceKeyDefinition(priceKey).canonicalUnit.replace('_per_', '_')
        : metal.trim().toLowerCase() === 'au' ? 'USD_toz' : null;
    } catch {
      priceUnit = null;
    }
  }

  if (!Array.isArray(prices) || !priceUnit) {
    return { metal, unit: display.unit, series: [], annualEq: null, tenYearEq: null, lomEq: null, productionYears: null, priceKey, priceUnit, status: 'MISSING_PRICE', diagnostic: `No canonical ${metal} price series/unit is available in the Corporate snapshot.` };
  }
  if (prices.length !== revenue.length) {
    return { metal, unit: display.unit, series: [], annualEq: null, tenYearEq: null, lomEq: null, productionYears: null, priceKey, priceUnit, status: 'INVALID_SERIES', diagnostic: `${metal} price series length does not match total revenue series.` };
  }

  const values = revenue.map((value, index) => {
    const sourcePrice = prices?.[index];
    if (!finite(value) || value < 0 || !finite(sourcePrice) || sourcePrice <= 0) return null;
    const canonicalPrice = convertPriceToCanonical(metal, sourcePrice, priceUnit as string);
    return finite(canonicalPrice) && canonicalPrice > 0 ? (value / canonicalPrice) / display.divisor : null;
  });

  const firstPositive = values.findIndex((value) => finite(value) && value > 0);
  let lastPositive = -1;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (finite(values[index]) && (values[index] as number) > 0) { lastPositive = index; break; }
  }
  if (firstPositive < 0 || lastPositive < firstPositive) {
    return { metal, unit: display.unit, series: values, annualEq: null, tenYearEq: null, lomEq: null, productionYears: null, priceKey, priceUnit, status: 'INVALID_SERIES', diagnostic: 'No positive equivalent-production periods are available.' };
  }

  const productionValues: number[] = [];
  for (let index = firstPositive; index <= lastPositive; index += 1) {
    const value = values[index];
    if (!finite(value) || value < 0) {
      return { metal, unit: display.unit, series: values, annualEq: null, tenYearEq: null, lomEq: null, productionYears: null, priceKey, priceUnit, status: 'INVALID_SERIES', diagnostic: 'Equivalent-production series contains a missing/invalid value inside the production window.' };
    }
    if (value > 0) productionValues.push(value);
  }
  if (productionValues.length === 0) {
    return { metal, unit: display.unit, series: values, annualEq: null, tenYearEq: null, lomEq: null, productionYears: null, priceKey, priceUnit, status: 'INVALID_SERIES', diagnostic: 'No positive equivalent-production periods are available.' };
  }

  const lomEq = productionValues.reduce((sum, value) => sum + value, 0);
  return {
    metal,
    unit: display.unit,
    series: values,
    annualEq: lomEq / productionValues.length,
    tenYearEq: productionValues.slice(0, 10).reduce((sum, value) => sum + value, 0),
    lomEq,
    productionYears: productionValues.length,
    priceKey,
    priceUnit,
    status: 'OK',
    diagnostic: null,
  };
}

export function deriveCorporatePreRevenueMetrics(args: {
  snapshot: CorporateSnapshotWithValuationSeries;
  currentPriceTargetCurrency: number | null;
  valuationYear: number;
  manualExtraShares?: number;
  referenceMetals?: string[];
}): CorporatePreRevenueMetrics {
  const { snapshot } = args;
  const extraShares = normalizeManualExtraShares(args.manualExtraShares ?? 0);
  const price = readFinite(args.currentPriceTargetCurrency);
  const scale = preRevenueExtraShareScale(snapshot, extraShares);
  const marker = nextRelevantProjectMarker(snapshot, args.valuationYear);
  const rawTarget = canonicalMarkerTarget(marker);
  const targetPrice = finite(rawTarget) ? rawTarget * scale : null;
  const targetYear = markerYear(marker);
  const yearsToProduction = finite(targetYear) && targetYear > args.valuationYear ? targetYear - args.valuationYear : null;
  const annualizedReturnToTarget = finite(targetPrice) && finite(price) && price > 0 && finite(yearsToProduction) && yearsToProduction > 0
    ? (targetPrice / price) ** (1 / yearsToProduction) - 1
    : null;
  const peak6xValuePerShare = computePreRevenuePeakSixTimesValuePerShare(snapshot, extraShares);
  const sharesPostFinancing = preRevenuePostFinancingShares(snapshot, extraShares);
  const initialCapexUSD = targetCurrencyToUsd(snapshot, marker?.lista2Metrics?.InitialCAPEX_incremental_TargetCurrency ?? null);
  const marketCapUSD = targetCurrencyToUsd(snapshot, snapshot.MarketCap_TargetCurrency);
  const enterpriseValueUSD = targetCurrencyToUsd(snapshot, snapshot.EV_TargetCurrency);
  const pNavPostFinancing = computePreRevenuePNavPostFinancing(snapshot, price, extraShares);

  const equivalentByMetal: Record<string, EquivalentMetalMetrics> = {};
  const byReferenceMetal: Record<string, CorporatePreRevenueReferenceMetalMetrics> = {};
  const diagnostics: string[] = [];
  for (const metal of candidateMetals(snapshot, args.referenceMetals)) {
    const eq = deriveEquivalentMetalMetrics(snapshot, metal);
    equivalentByMetal[metal] = eq;
    if (eq.diagnostic) diagnostics.push(`${metal}Eq: ${eq.diagnostic}`);
    byReferenceMetal[metal] = {
      metal,
      unit: eq.unit,
      capexPerAnnualEqUSD: eq.status === 'OK' && finite(initialCapexUSD) && finite(eq.annualEq) && eq.annualEq > 0 ? initialCapexUSD / eq.annualEq : null,
      lomEqPerShare: eq.status === 'OK' && finite(sharesPostFinancing) && sharesPostFinancing > 0 && finite(eq.lomEq) ? eq.lomEq / sharesPostFinancing : null,
      marketCapPerTenYearEqUSD: eq.status === 'OK' && finite(marketCapUSD) && finite(eq.tenYearEq) && eq.tenYearEq > 0 ? marketCapUSD / eq.tenYearEq : null,
      marketCapPerLomEqUSD: eq.status === 'OK' && finite(marketCapUSD) && finite(eq.lomEq) && eq.lomEq > 0 ? marketCapUSD / eq.lomEq : null,
      evPerLomEqUSD: eq.status === 'OK' && finite(enterpriseValueUSD) && finite(eq.lomEq) && eq.lomEq > 0 ? enterpriseValueUSD / eq.lomEq : null,
    };
  }

  const irr = readFinite(snapshot.corporate?.lista3Metrics?.IRR);
  if (irr === null) diagnostics.push('Corporate IRR is unavailable; no Project-engine fallback is used.');

  return {
    irr,
    paybackYears: readFinite(snapshot.Payback_real_years) ?? readFinite(snapshot.Payback_approx_years),
    lomYears: canonicalProductionYears(snapshot),
    initialCapexUSD,
    sharesPostFinancing,
    marketCapUSD,
    enterpriseValueUSD,
    pNavPostFinancing,
    peak6xValuePerShare,
    peak6xOverCurrentPrice: finite(peak6xValuePerShare) && finite(price) && price > 0 ? peak6xValuePerShare / price : null,
    nextProjectMarkerYear: targetYear,
    targetPrice,
    targetOverCurrentPrice: finite(targetPrice) && finite(price) && price > 0 ? targetPrice / price : null,
    annualizedReturnToTarget,
    equivalentByMetal,
    byReferenceMetal,
    diagnostics,
  };
}
