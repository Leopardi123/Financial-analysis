import type { Tier1CostMetric, Tier1Metal } from './config.ts';

const LB_PER_TONNE = 2204.6226218487757;
const COGS_RECONCILIATION_REL_TOLERANCE = 0.01;
const COGS_RECONCILIATION_ABS_TOLERANCE_USD = 1_000;

type NumericSeries = Array<number | null>;

type EconomicsBreakdownLike = {
  meta?: { costBaseYear?: number | null } | null;
  cogs?: {
    miningUSD?: NumericSeries;
    millingUSD?: NumericSeries;
    utilitiesUSD?: NumericSeries;
    maintenanceUSD?: NumericSeries;
    campUSD?: NumericSeries;
    siteGandA_USD?: NumericSeries;
  };
  selling?: {
    treatmentChargesUSD?: NumericSeries;
    refiningChargesUSD?: NumericSeries;
    tcRcUSD?: NumericSeries;
    transportUSD?: NumericSeries;
  };
} | null;

export type CanonicalCostProjectInput = {
  projectId: string;
  primaryMetal: Tier1Metal;
  productionStartPeriod: number;
  masterN: number;
  payableQtyByMetal: Record<string, NumericSeries>;
  payableQtyUnitByMetal: Record<string, string>;
  operatingCostsUSD: NumericSeries;
  siteGandA_USD: NumericSeries;
  byproductCreditsUSD: NumericSeries;
  economicsBreakdown: EconomicsBreakdownLike;
  revenueByMetalUSD: Record<string, NumericSeries>;
  rawJson?: unknown;
};

export type CanonicalCostResult = {
  status: 'COMPUTABLE' | 'NOT_VERIFIED';
  metric: Tier1CostMetric | null;
  value: number | null;
  unit: 'USD/lb' | 'USD/toz' | null;
  numeratorUSD: number | null;
  denominator: number | null;
  costBaseYear: number | null;
  reason: string;
  diagnostics: string[];
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function extractCostBaseYear(rawJson: unknown, economicsBreakdown?: EconomicsBreakdownLike): number | null {
  const direct = economicsBreakdown?.meta?.costBaseYear;
  if (Number.isInteger(direct) && (direct as number) >= 1900 && (direct as number) <= 2100) return direct as number;

  const root = asRecord(rawJson);
  const breakdown = asRecord(root.economicsBreakdown);
  const meta = asRecord(breakdown.meta);
  const raw = meta.costBaseYear;
  return Number.isInteger(raw) && (raw as number) >= 1900 && (raw as number) <= 2100 ? raw as number : null;
}

export function benchmarkCostBaseYear(dataPeriod: string): number | null {
  const match = String(dataPeriod ?? '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function seriesComplete(series: NumericSeries | undefined, indices: number[]): series is NumericSeries {
  return Array.isArray(series) && indices.every((index) => finite(series[index]));
}

function payableLb(value: number, unit: string): number | null {
  if (unit === 'lb') return value;
  if (unit === 'tonne') return value * LB_PER_TONNE;
  if (unit === 'kg') return value * 2.2046226218487757;
  return null;
}

function notVerified(metric: Tier1CostMetric | null, reason: string, diagnostics: string[] = [], costBaseYear: number | null = null): CanonicalCostResult {
  return {
    status: 'NOT_VERIFIED', metric, value: null, unit: metric?.includes('USD_PER_LB') ? 'USD/lb' : metric ? 'USD/toz' : null,
    numeratorUSD: null, denominator: null, costBaseYear, reason, diagnostics,
  };
}

function productionIndices(input: CanonicalCostProjectInput): number[] {
  const payable = input.payableQtyByMetal[input.primaryMetal] ?? [];
  const out: number[] = [];
  for (let t = Math.max(0, input.productionStartPeriod); t <= input.masterN; t += 1) {
    if (finite(payable[t]) && (payable[t] as number) > 0) out.push(t);
  }
  return out;
}

function reconciledMineSiteCogs(
  input: CanonicalCostProjectInput,
  metric: Tier1CostMetric,
  indices: number[],
  costBaseYear: number | null,
): { diagnostics: string[] } | CanonicalCostResult {
  if (!seriesComplete(input.operatingCostsUSD, indices)) {
    return notVerified(metric, 'operatingCostsUSD är inte komplett över producerande perioder.', [], costBaseYear);
  }
  if (!seriesComplete(input.siteGandA_USD, indices)) {
    return notVerified(metric, 'siteGandA_USD är inte komplett över producerande perioder; noll måste anges explicit om posten inte finns.', [], costBaseYear);
  }

  const cogs = input.economicsBreakdown?.cogs;
  if (!cogs) return notVerified(metric, 'COGS-breakdown saknas; C1 får inte byggas från odifferentierad OPEX utan reconciliation.', [], costBaseYear);
  const cogsSeries = [cogs.miningUSD, cogs.millingUSD, cogs.utilitiesUSD, cogs.maintenanceUSD, cogs.campUSD];
  if (!cogsSeries.every((series) => seriesComplete(series, indices))) {
    return notVerified(metric, 'COGS-breakdown är ofullständig. Mining, milling, utilities, maintenance och camp måste vara explicita (0 tillåts).', [], costBaseYear);
  }

  const diagnostics: string[] = [];
  for (const t of indices) {
    const subtotal = cogsSeries.reduce((sum, series) => sum + ((series as NumericSeries)[t] as number), 0);
    const operating = input.operatingCostsUSD[t] as number;
    const tolerance = Math.max(COGS_RECONCILIATION_ABS_TOLERANCE_USD, Math.abs(operating) * COGS_RECONCILIATION_REL_TOLERANCE);
    if (Math.abs(subtotal - operating) > tolerance) {
      return notVerified(
        metric,
        `COGS-breakdown reconcilerar inte mot operatingCostsUSD i period ${t}; risk för saknad eller dubbelräknad C1-kostnad.`,
        [`period=${t}; cogs=${subtotal}; operatingCostsUSD=${operating}; tolerance=${tolerance}`],
        costBaseYear,
      );
    }
  }
  diagnostics.push('COGS-breakdown reconcilerar mot operatingCostsUSD inom 1 % / 1 000 USD tolerans.');
  return { diagnostics };
}

/**
 * Copper C1 aligned to the cited Santa Cruz PFS / S&P co-product comparison.
 * Santa Cruz's disclosed US$1.32/lb is mining + processing + site G&A divided
 * by payable copper. Royalties and sustaining capital are outside C1. Because
 * project_json currently has no verified co-product cost-allocation contract,
 * a Cu project with secondary metal revenue cannot be reconstructed safely.
 */
export function computeCanonicalC1ForProject(input: CanonicalCostProjectInput): CanonicalCostResult {
  const metric: Tier1CostMetric | null = input.primaryMetal === 'Cu' ? 'C1_CU_USD_PER_LB' : null;
  const costBaseYear = extractCostBaseYear(input.rawJson, input.economicsBreakdown);
  if (!metric) return notVerified(null, `${input.primaryMetal} använder inte Cu-C1-bryggan i Tier-motorn.`, [], costBaseYear);

  const indices = productionIndices(input);
  if (indices.length === 0) return notVerified(metric, 'Ingen positiv payable Cu-produktion finns för C1-denominatorn.', [], costBaseYear);
  const payable = input.payableQtyByMetal.Cu;
  const payableUnit = input.payableQtyUnitByMetal.Cu;
  if (!payableUnit) return notVerified(metric, 'Payable-enhet saknas för Cu.', [], costBaseYear);
  if (!seriesComplete(input.byproductCreditsUSD, indices)) {
    return notVerified(metric, 'byproductCreditsUSD är inte komplett; Santa Cruz/S&P-kompatibel Cu C1 kräver explicit 0 när ingen co-product-allokering finns.', [], costBaseYear);
  }

  const reconciled = reconciledMineSiteCogs(input, metric, indices, costBaseYear);
  if ('status' in reconciled) return reconciled;
  const diagnostics = reconciled.diagnostics;

  const secondaryMetalNames = Object.entries(input.revenueByMetalUSD)
    .filter(([metal, revenue]) => metal !== 'Cu' && indices.some((t) => finite(revenue[t]) && (revenue[t] as number) > 0))
    .map(([metal]) => metal);
  if (secondaryMetalNames.length > 0) {
    return notVerified(
      metric,
      `Sekundära metallintäkter (${secondaryMetalNames.join(', ')}) finns. Benchmarken är S&P co-product C1 men project_json saknar verifierad co-product-kostnadsallokering; ingen by-product-credit-proxy används.`,
      diagnostics,
      costBaseYear,
    );
  }
  if (indices.some((t) => (input.byproductCreditsUSD[t] as number) !== 0)) {
    return notVerified(
      metric,
      'byproductCreditsUSD är inte noll. Santa Cruz/S&P-kompatibel Cu C1 får inte rekonstrueras genom att dra av ospecificerade by-product credits.',
      diagnostics,
      costBaseYear,
    );
  }

  let numeratorUSD = 0;
  let denominatorLb = 0;
  for (const t of indices) {
    const qty = payable[t];
    if (!finite(qty) || qty <= 0) continue;
    const qtyLb = payableLb(qty, payableUnit);
    if (!finite(qtyLb) || qtyLb <= 0) {
      return notVerified(metric, `Payable-enheten ${payableUnit} kan inte konverteras definitionssäkert till lb för Cu C1.`, diagnostics, costBaseYear);
    }
    numeratorUSD += (input.operatingCostsUSD[t] as number) + (input.siteGandA_USD[t] as number);
    denominatorLb += qtyLb;
  }

  if (!(denominatorLb > 0) || !finite(numeratorUSD)) return notVerified(metric, 'Cu C1 numerator eller denominator blev ogiltig.', diagnostics, costBaseYear);
  return {
    status: 'COMPUTABLE', metric, value: numeratorUSD / denominatorLb, unit: 'USD/lb',
    numeratorUSD, denominator: denominatorLb, costBaseYear,
    reason: 'Canonical Cu C1 (Santa Cruz/S&P-kompatibel för single-product Cu) = mine-site operating costs + site G&A per payable Cu-lb. Royalties, sustaining CAPEX, TC/RC, transport och by-product credits ingår inte i denna brygga.',
    diagnostics,
  };
}

/** Nickel-specific C1 matching the disclosed Jaguar first-quartile bridge. */
export function computeCanonicalNickelC1ForProject(input: CanonicalCostProjectInput): CanonicalCostResult {
  const metric: Tier1CostMetric = 'C1_NI_USD_PER_LB';
  const costBaseYear = extractCostBaseYear(input.rawJson, input.economicsBreakdown);
  if (input.primaryMetal !== 'Ni') return notVerified(metric, `${input.primaryMetal} använder inte Ni-C1-bryggan.`, [], costBaseYear);

  const indices = productionIndices(input);
  if (indices.length === 0) return notVerified(metric, 'Ingen positiv payable Ni-produktion finns för C1-denominatorn.', [], costBaseYear);
  const payable = input.payableQtyByMetal.Ni;
  const payableUnit = input.payableQtyUnitByMetal.Ni;
  if (!payableUnit) return notVerified(metric, 'Payable-enhet saknas för Ni.', [], costBaseYear);
  if (!seriesComplete(input.byproductCreditsUSD, indices)) {
    return notVerified(metric, 'byproductCreditsUSD är inte komplett; Jaguar-kompatibel Ni C1 kräver explicit 0 eftersom by-product credit ligger utanför C1-bryggan.', [], costBaseYear);
  }

  const reconciled = reconciledMineSiteCogs(input, metric, indices, costBaseYear);
  if ('status' in reconciled) return reconciled;
  const diagnostics = reconciled.diagnostics;

  const secondaryMetalNames = Object.entries(input.revenueByMetalUSD)
    .filter(([metal, revenue]) => metal !== 'Ni' && indices.some((t) => finite(revenue[t]) && (revenue[t] as number) > 0))
    .map(([metal]) => metal);
  if (secondaryMetalNames.length > 0) {
    return notVerified(metric, `Sekundära metallintäkter (${secondaryMetalNames.join(', ')}) finns. Jaguar-referensens Ni C1 redovisar by-product credit utanför C1; ingen implicit kredit eller kostnadsallokering görs.`, diagnostics, costBaseYear);
  }
  if (indices.some((t) => (input.byproductCreditsUSD[t] as number) !== 0)) {
    return notVerified(metric, 'byproductCreditsUSD är inte noll. Jaguar-referensens Ni C1 placerar by-product credit utanför C1 och värdet kan därför inte jämföras definitionssäkert.', diagnostics, costBaseYear);
  }

  let numeratorUSD = 0;
  let denominatorLb = 0;
  for (const t of indices) {
    const qty = payable[t];
    if (!finite(qty) || qty <= 0) continue;
    const qtyLb = payableLb(qty, payableUnit);
    if (!finite(qtyLb) || qtyLb <= 0) return notVerified(metric, `Payable-enheten ${payableUnit} kan inte konverteras till lb för Ni C1.`, diagnostics, costBaseYear);
    numeratorUSD += (input.operatingCostsUSD[t] as number) + (input.siteGandA_USD[t] as number);
    denominatorLb += qtyLb;
  }
  if (!(denominatorLb > 0) || !finite(numeratorUSD)) return notVerified(metric, 'Ni C1 numerator eller denominator blev ogiltig.', diagnostics, costBaseYear);

  return {
    status: 'COMPUTABLE', metric, value: numeratorUSD / denominatorLb, unit: 'USD/lb',
    numeratorUSD, denominator: denominatorLb, costBaseYear,
    reason: 'Canonical Ni C1 (Jaguar-kompatibel) = mine-site operating costs + site G&A per payable Ni-lb. Produktlogistik, royalties, by-product credits och sustaining CAPEX ligger utanför denna C1-definition.',
    diagnostics,
  };
}

export function canonicalCostMetricForPrimaryMetal(input: CanonicalCostProjectInput): CanonicalCostResult {
  if (input.primaryMetal === 'Cu') return computeCanonicalC1ForProject(input);
  if (input.primaryMetal === 'Ni') return computeCanonicalNickelC1ForProject(input);

  const costBaseYear = extractCostBaseYear(input.rawJson, input.economicsBreakdown);
  const metricByMetal: Partial<Record<Tier1Metal, Tier1CostMetric>> = {
    Au: 'AISC_AU_USD_PER_TOZ',
    Ag: 'AISC_AGEQ_USD_PER_TOZ',
    Zn: 'AISC_ZNEQ_USD_PER_LB',
    Pb: 'AISC_ZNEQ_USD_PER_LB',
    Pt: 'AISC_PGM3E_USD_PER_TOZ',
    Pd: 'AISC_PGM3E_USD_PER_TOZ',
  };
  const metric = metricByMetal[input.primaryMetal] ?? null;
  return notVerified(
    metric,
    'Full canonical AISC kan ännu inte verifieras från project_json: nuvarande sustaining-cost-serie saknar ett hårt WGC-liknande kontrakt för bl.a. corporate G&A och sustaining exploration/studies. Befintligt equivalent-mått är därför diagnostiskt, inte en Q1-gate.',
    [],
    costBaseYear,
  );
}

export function costVintageCompatibility(costBaseYear: number | null, benchmarkDataPeriod: string): { compatible: boolean; benchmarkYear: number | null; reason: string } {
  const benchmarkYear = benchmarkCostBaseYear(benchmarkDataPeriod);
  if (costBaseYear === null) {
    return { compatible: false, benchmarkYear, reason: 'Projektets kostnadsbasår saknas; ett gammalt nominellt C1/AISC får inte jämföras med dagens Q1-referens.' };
  }
  if (benchmarkYear === null) {
    return { compatible: false, benchmarkYear: null, reason: 'Benchmarkens kostnadsår kunde inte fastställas.' };
  }
  if (costBaseYear !== benchmarkYear) {
    return { compatible: false, benchmarkYear, reason: `Projektets kostnadsbasår ${costBaseYear} matchar inte benchmarkens ${benchmarkYear}. Ingen implicit kostnadsindexering görs.` };
  }
  return { compatible: true, benchmarkYear, reason: `Kostnadsbasår ${costBaseYear} matchar benchmarkåret ${benchmarkYear}.` };
}
