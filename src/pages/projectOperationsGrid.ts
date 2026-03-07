import { rowHasDisplayValue } from '../lib/project/rowDisplayValue.ts';

export type OperationsGridInput = {
  masterN: number;
  productionStartPeriod: number | null;
  yearsByPeriod: number[];
  operations?: {
    oreMilledTonnes?: Array<number | null>;
    oreMinedTonnes?: Array<number | null>;
    oreTonnageUnit?: string | null;
    gradeByMetal?: Record<string, Array<number | null>>;
    gradeUnitByMetal?: Record<string, string>;
    recoveryPctByMetal?: Record<string, Array<number | null>>;
    capacity?: {
      throughputUnit?: string | null;
      nameplateThroughput?: number | null;
      utilizationPct?: number | null;
    };
  } | null;
  metals: {
    payableQtyByMetal?: Record<string, Array<number | null>>;
    payableQtyUnitByMetal?: Record<string, string>;
  };
  economics?: {
    priceUSDByMetal?: Record<string, Array<number | null>>;
    operatingCostsUSD?: Array<number | null>;
    royaltiesUSD?: Array<number | null>;
    siteGandA_USD?: Array<number | null>;
    byproductCreditsUSD?: Array<number | null>;
    royaltiesDetail?: Array<{
      id?: string;
      base?: string | null;
      rateType?: string | null;
      rate?: number | string | null;
    }> | null;
    ebitdaUSD?: Array<number | null>;
    ebitUSD?: Array<number | null>;
    depreciationUSD?: Array<number | null>;
    taxableIncomeUSD?: Array<number | null>;
    taxUSD?: Array<number | null>;
    effectiveTaxRate?: Array<number | null>;
  };
};

export type OperationsGridRow = { label: string; values: Array<number | null> };

export type OperationsGridModel = {
  columnCount: number;
  years: string[];
  tIndex: string[];
  tMinusTp: string[];
  rows: OperationsGridRow[];
  totals: Array<{ label: string; value: number | null }>;
  capacity: {
    throughputUnit: string | null;
    nameplateThroughput: number | null;
    utilizationPct: number | null;
    effectiveThroughput: number | null;
  };
  warnings: string[];
  notes: string[];
};

function yearLabel(value: number | null | undefined): string {
  return Number.isInteger(value) ? String(value) : '—';
}

function strictTotal(values: Array<number | null>, startIndex: number): number | null {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > values.length) return null;
  let sum = 0;
  for (let i = startIndex; i < values.length; i += 1) {
    const value = values[i];
    if (value === null || !Number.isFinite(value)) return null;
    sum += value;
  }
  return sum;
}

function hasAnyValue(values: Array<number | null> | undefined): values is Array<number | null> {
  return Array.isArray(values) && values.some((value) => typeof value === 'number' && Number.isFinite(value));
}

function normalizeRecoverySeries(values: Array<number | null> | undefined, columnCount: number): Array<number | null> | null {
  if (!Array.isArray(values)) return null;
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (finite.length === 0) return null;
  const isFraction = finite.every((value) => value >= 0 && value <= 1);
  return Array.from({ length: columnCount }, (_, i) => {
    const value = values[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return isFraction ? value * 100 : value;
  });
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return normalized.length > 0 ? normalized : null;
}

function normalizeRateType(value: string | null | undefined): string | null {
  const token = normalizeToken(value);
  if (token === null) return null;
  const compact = token.replace(/_/g, '');
  if (compact === 'nsrpct') return 'nsr_pct';
  if (compact === 'advalorempct') return 'ad_valorem_pct';
  return token;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function buildOperationsGridModel(input: OperationsGridInput): OperationsGridModel {
  const columnCount = Math.max(0, input.masterN + 1);
  const warnings: string[] = [];
  const notes: string[] = [];
  const hasValidYearsByPeriod = Array.isArray(input.yearsByPeriod) && input.yearsByPeriod.length === columnCount;

  if (!hasValidYearsByPeriod) {
    warnings.push('yearsByPeriod missing or mismatched; showing t-only columns.');
  }

  if (!input.operations) {
    notes.push('Operations block missing (capacity/tonnes).');
  }

  const years = Array.from({ length: columnCount }, (_, t) => hasValidYearsByPeriod ? yearLabel(input.yearsByPeriod[t]) : '—');
  const tIndex = Array.from({ length: columnCount }, (_, t) => `${t}`);
  const hasValidTp = Number.isInteger(input.productionStartPeriod);
  const tp = hasValidTp ? (input.productionStartPeriod as number) : null;
  const tMinusTp = Array.from({ length: columnCount }, (_, t) => (tp === null ? '—' : `${t - tp}`));

  const rows: OperationsGridRow[] = [];
  const oreUnit = input.operations?.oreTonnageUnit ?? 'tonne';

  if (Array.isArray(input.operations?.oreMinedTonnes)) {
    rows.push({ label: `Ore mined (${oreUnit})`, values: input.operations?.oreMinedTonnes ?? [] });
  }
  if (Array.isArray(input.operations?.oreMilledTonnes)) {
    rows.push({ label: `Ore milled (${oreUnit})`, values: input.operations?.oreMilledTonnes ?? [] });
  }

  const oreMilledByPeriod = Array.isArray(input.operations?.oreMilledTonnes)
    ? Array.from({ length: columnCount }, (_, t) => input.operations?.oreMilledTonnes?.[t] ?? null)
    : null;

  const maskGradeRecoveryBeforeProduction = (values: Array<number | null>): Array<number | null> => (
    Array.from({ length: columnCount }, (_, t) => {
      const rawValue = values[t];
      if (rawValue === null || !Number.isFinite(rawValue)) return null;
      if (tp !== null && t < tp) return null;
      const milled = oreMilledByPeriod?.[t] ?? null;
      if (milled !== null && Number.isFinite(milled) && milled === 0) return null;
      return rawValue;
    })
  );

  const metals = Object.keys(input.metals.payableQtyByMetal ?? {}).sort((a, b) => a.localeCompare(b));

  for (const metal of metals) {
    const gradeValues = input.operations?.gradeByMetal?.[metal];
    if (!hasAnyValue(gradeValues)) continue;
    const gradeUnit = input.operations?.gradeUnitByMetal?.[metal] ?? '—';
    rows.push({ label: `Grade ${metal} (${gradeUnit})`, values: maskGradeRecoveryBeforeProduction(gradeValues) });
  }

  for (const metal of metals) {
    const recoveryValues = normalizeRecoverySeries(input.operations?.recoveryPctByMetal?.[metal], columnCount);
    if (!recoveryValues) continue;
    rows.push({ label: `Recovery ${metal} (%)`, values: maskGradeRecoveryBeforeProduction(recoveryValues) });
  }

  for (const metal of metals) {
    const values = input.metals.payableQtyByMetal?.[metal];
    if (!Array.isArray(values)) continue;
    const unit = input.metals.payableQtyUnitByMetal?.[metal];
    rows.push({ label: `Payable ${metal} (${unit ?? '—'})`, values });
  }

  const priceUSDByMetal = input.economics?.priceUSDByMetal ?? {};
  const revenueByMetal: Record<string, Array<number | null>> = {};
  for (const metal of metals) {
    const qty = input.metals.payableQtyByMetal?.[metal];
    const price = priceUSDByMetal[metal];
    if (!Array.isArray(qty)) continue;
    const revenue = Array.from({ length: columnCount }, (_, t) => {
      const q = qty[t];
      const p = price?.[t];
      if (q === null || p === null || !Number.isFinite(q) || !Number.isFinite(p)) return null;
      return q * p;
    });
    revenueByMetal[metal] = revenue;
    rows.push({ label: `Revenue ${metal} (USD)`, values: revenue });
  }

  const grossRevenue = Array.from({ length: columnCount }, (_, t) => {
    if (metals.length === 0) return null;
    let sum = 0;
    let hasFinite = false;
    for (const metal of metals) {
      const value = revenueByMetal[metal]?.[t] ?? null;
      if (value === null || !Number.isFinite(value)) continue;
      sum += value;
      hasFinite = true;
    }
    return hasFinite ? sum : null;
  });
  if (metals.length > 0) rows.push({ label: 'Gross revenue (USD)', values: grossRevenue });

  const royaltiesDetail = input.economics?.royaltiesDetail ?? null;
  const computableRules = (royaltiesDetail ?? [])
    .map((detail) => ({
      detail,
      baseNormalized: normalizeToken(detail.base ?? null),
      rateTypeNormalized: normalizeRateType(detail.rateType ?? null),
      rateParsed: parseFiniteNumber(detail.rate),
    }))
    .filter((item) => item.baseNormalized === 'revenue'
      && (item.rateTypeNormalized === 'nsr_pct' || item.rateTypeNormalized === 'ad_valorem_pct')
      && item.rateParsed !== null);
  const hasComputedRoyalties = computableRules.length > 0;
  if (hasComputedRoyalties) {
    notes.push('Royalties (computed)');
  }

  const effectiveRoyaltiesUSD = Array.from({ length: columnCount }, (_, t) => {
    if (!hasComputedRoyalties) {
      return finiteOrNull(input.economics?.royaltiesUSD?.[t]);
    }
    const revenue = grossRevenue[t];
    if (revenue === null || !Number.isFinite(revenue)) return null;
    let sum = 0;
    for (const item of computableRules) {
      sum += revenue * ((item.rateParsed as number) / 100);
    }
    return sum;
  });
  const effectiveRoyaltyRatePct = Array.from({ length: columnCount }, (_, t) => {
    if (!hasComputedRoyalties) return null;
    const revenue = grossRevenue[t];
    const royalties = effectiveRoyaltiesUSD[t];
    if (revenue === null || royalties === null || !Number.isFinite(revenue) || !Number.isFinite(royalties)) return null;
    if (revenue === 0) return royalties === 0 ? 0 : null;
    return (royalties / revenue) * 100;
  });
  if (metals.length > 0) rows.push({ label: 'Royalty rate (%)', values: effectiveRoyaltyRatePct });
  if (metals.length > 0) rows.push({ label: 'Royalties (USD)', values: effectiveRoyaltiesUSD });

  const byproductCredits = Array.from({ length: columnCount }, (_, t) => finiteOrNull(input.economics?.byproductCreditsUSD?.[t]) ?? 0);
  const grossProfit = Array.from({ length: columnCount }, (_, t) => {
    const revenue = grossRevenue[t];
    const operatingCost = input.economics?.operatingCostsUSD?.[t] ?? null;
    const royalties = effectiveRoyaltiesUSD[t] ?? null;
    if (revenue === null || operatingCost === null || royalties === null || !Number.isFinite(revenue) || !Number.isFinite(operatingCost) || !Number.isFinite(royalties)) return null;
    return revenue - operatingCost - royalties - byproductCredits[t];
  });
  if (metals.length > 0) rows.push({ label: 'Gross profit (USD)', values: grossProfit });

  const ebitda = Array.from({ length: columnCount }, (_, t) => {
    const revenue = grossRevenue[t];
    const operatingCost = input.economics?.operatingCostsUSD?.[t] ?? null;
    const royalties = effectiveRoyaltiesUSD[t] ?? null;
    if (revenue === null || operatingCost === null || royalties === null || !Number.isFinite(revenue) || !Number.isFinite(operatingCost) || !Number.isFinite(royalties)) return null;
    return revenue - operatingCost - royalties;
  });
  const siteGandA = Array.from({ length: columnCount }, (_, t) => finiteOrNull(input.economics?.siteGandA_USD?.[t]) ?? 0);

  const ebit = Array.from({ length: columnCount }, (_, t) => {
    const revenue = grossRevenue[t];
    const operatingCost = input.economics?.operatingCostsUSD?.[t] ?? null;
    const royalties = effectiveRoyaltiesUSD[t] ?? null;
    if (revenue === null || operatingCost === null || royalties === null || !Number.isFinite(revenue) || !Number.isFinite(operatingCost) || !Number.isFinite(royalties)) return null;
    return revenue - operatingCost - siteGandA[t] - royalties + byproductCredits[t];
  });
  if (metals.length > 0) {
    rows.push({ label: 'EBITDA (USD)', values: ebitda });
    rows.push({ label: 'Site G&A (USD)', values: siteGandA });
    rows.push({ label: 'EBIT (USD)', values: ebit });
  }
  if (Array.isArray(input.economics?.taxableIncomeUSD)) {
    rows.push({ label: 'Taxable income (USD)', values: input.economics?.taxableIncomeUSD ?? [] });
  }
  if (Array.isArray(input.economics?.taxUSD)) {
    rows.push({ label: 'Tax (USD)', values: input.economics?.taxUSD ?? [] });
  }
  if (Array.isArray(input.economics?.effectiveTaxRate)) {
    rows.push({ label: 'Effective tax rate', values: input.economics?.effectiveTaxRate ?? [] });
  }

  const totals: Array<{ label: string; value: number | null }> = [];
  const totalStart = tp ?? -1;
  if (Array.isArray(input.operations?.oreMilledTonnes)) {
    totals.push({ label: `Total ore milled (t>=tp) (${oreUnit})`, value: strictTotal(input.operations.oreMilledTonnes, totalStart) });
  }
  if (Array.isArray(input.operations?.oreMinedTonnes)) {
    totals.push({ label: `Total ore mined (t>=tp) (${oreUnit})`, value: strictTotal(input.operations.oreMinedTonnes, totalStart) });
  }
  for (const metal of metals) {
    const values = input.metals.payableQtyByMetal?.[metal];
    if (!Array.isArray(values)) continue;
    const unit = input.metals.payableQtyUnitByMetal?.[metal] ?? '—';
    totals.push({ label: `Total payable ${metal} (t>=tp) (${unit})`, value: strictTotal(values, totalStart) });
  }

  const nameplateThroughput = input.operations?.capacity?.nameplateThroughput ?? null;
  const utilizationPct = input.operations?.capacity?.utilizationPct ?? null;
  const effectiveThroughput = Number.isFinite(nameplateThroughput) && Number.isFinite(utilizationPct)
    ? (nameplateThroughput as number) * (utilizationPct as number)
    : null;

  return {
    columnCount,
    years,
    tIndex,
    tMinusTp,
    rows: rows.filter((row) => rowHasDisplayValue(row.values)),
    totals,
    capacity: {
      throughputUnit: input.operations?.capacity?.throughputUnit ?? null,
      nameplateThroughput,
      utilizationPct,
      effectiveThroughput,
    },
    warnings,
    notes,
  };
}
