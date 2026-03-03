export type OperationsGridInput = {
  masterN: number;
  productionStartPeriod: number | null;
  productionStartYear: number | null;
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
    royaltiesDetail?: Array<{
      id?: string;
      base?: string | null;
      rateType?: string | null;
      rate?: number | null;
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

export function buildOperationsGridModel(input: OperationsGridInput): OperationsGridModel {
  const columnCount = Math.max(0, input.masterN + 1);
  const warnings: string[] = [];
  const notes: string[] = [];
  if (!input.operations) {
    notes.push('Operations block missing (capacity/tonnes).');
  }

  const hasValidTp = Number.isInteger(input.productionStartPeriod);
  const tp = hasValidTp ? (input.productionStartPeriod as number) : null;
  const hasValidProductionStartYear = Number.isInteger(input.productionStartYear);
  const startYear = hasValidProductionStartYear && tp !== null ? (input.productionStartYear as number) - tp : null;
  const years = Array.from({ length: columnCount }, (_, t) => (startYear === null ? '—' : String(startYear + t)));
  const tIndex = Array.from({ length: columnCount }, (_, t) => `${t}`);
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
    for (const metal of metals) {
      const value = revenueByMetal[metal]?.[t] ?? null;
      if (value === null || !Number.isFinite(value)) return null;
      sum += value;
    }
    return sum;
  });
  if (metals.length > 0) rows.push({ label: 'Gross revenue (USD)', values: grossRevenue });

  const grossProfit = Array.from({ length: columnCount }, (_, t) => {
    const revenue = grossRevenue[t];
    const operatingCost = input.economics?.operatingCostsUSD?.[t] ?? null;
    if (revenue === null || operatingCost === null || !Number.isFinite(revenue) || !Number.isFinite(operatingCost)) return null;
    return revenue - operatingCost;
  });
  if (metals.length > 0) rows.push({ label: 'Gross profit (USD)', values: grossProfit });

  const royaltiesDetail = input.economics?.royaltiesDetail ?? null;
  const computableRules = (royaltiesDetail ?? []).filter((detail) => {
    const rate = detail.rate;
    return detail.base === 'revenue'
      && (detail.rateType === 'NSR_pct' || detail.rateType === 'ad_valorem_pct')
      && typeof rate === 'number'
      && Number.isFinite(rate);
  });
  const hasComputedRoyalties = computableRules.length > 0;
  if (hasComputedRoyalties) {
    notes.push('Royalties (computed)');
  }

  const effectiveRoyaltiesUSD = Array.from({ length: columnCount }, (_, t) => {
    if (!hasComputedRoyalties) {
      const fallback = input.economics?.royaltiesUSD?.[t] ?? 0;
      return Number.isFinite(fallback) ? fallback : null;
    }
    const revenue = grossRevenue[t];
    if (revenue === null || !Number.isFinite(revenue)) return null;
    let sum = 0;
    for (const detail of computableRules) {
      sum += revenue * ((detail.rate as number) / 100);
    }
    return sum;
  });
  if (metals.length > 0) rows.push({ label: 'Royalties (USD)', values: effectiveRoyaltiesUSD });

  const ebitda = Array.from({ length: columnCount }, (_, t) => {
    const revenue = grossRevenue[t];
    const operatingCost = input.economics?.operatingCostsUSD?.[t] ?? null;
    const royalties = effectiveRoyaltiesUSD[t] ?? null;
    if (revenue === null || operatingCost === null || royalties === null || !Number.isFinite(revenue) || !Number.isFinite(operatingCost) || !Number.isFinite(royalties)) return null;
    return revenue - operatingCost - royalties;
  });

  const hasDepreciation = Array.isArray(input.economics?.depreciationUSD);
  const ebit = Array.from({ length: columnCount }, (_, t) => {
    if (!hasDepreciation) {
      const explicit = input.economics?.ebitUSD?.[t] ?? null;
      return explicit !== null && Number.isFinite(explicit) ? explicit : null;
    }
    const ebitdaValue = ebitda[t];
    const depreciation = input.economics?.depreciationUSD?.[t] ?? null;
    if (ebitdaValue === null || depreciation === null || !Number.isFinite(ebitdaValue) || !Number.isFinite(depreciation)) return null;
    return ebitdaValue - depreciation;
  });
  if (Array.isArray(input.economics?.ebitUSD) || hasDepreciation) {
    rows.push({ label: 'EBITDA (USD)', values: ebitda });
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
    rows,
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
