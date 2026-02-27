export type OperationsGridInput = {
  masterN: number;
  productionStartPeriod: number | null;
  periodEndDatesUtc?: Array<string | null>;
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

function yearLabel(value: string | null | undefined): string {
  if (typeof value !== 'string') return '—';
  const yearMatch = value.match(/^(\d{4})/);
  return yearMatch?.[1] ?? '—';
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

export function buildOperationsGridModel(input: OperationsGridInput): OperationsGridModel {
  const columnCount = Math.max(0, input.masterN + 1);
  const warnings: string[] = [];
  const notes: string[] = [];
  const hasValidPeriodDates = Array.isArray(input.periodEndDatesUtc) && input.periodEndDatesUtc.length === columnCount;

  if (!hasValidPeriodDates) {
    warnings.push('Period end dates missing or mismatched; showing t-only columns.');
  }

  if (!input.operations) {
    notes.push('Operations block missing (capacity/tonnes).');
  }

  const years = Array.from({ length: columnCount }, (_, t) => hasValidPeriodDates ? yearLabel(input.periodEndDatesUtc?.[t]) : '—');
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

  const metals = Object.keys(input.metals.payableQtyByMetal ?? {}).sort((a, b) => a.localeCompare(b));

  for (const metal of metals) {
    const gradeValues = input.operations?.gradeByMetal?.[metal];
    if (!hasAnyValue(gradeValues)) continue;
    const gradeUnit = input.operations?.gradeUnitByMetal?.[metal] ?? '—';
    rows.push({ label: `Grade ${metal} (${gradeUnit})`, values: gradeValues });
  }

  for (const metal of metals) {
    const recoveryValues = normalizeRecoverySeries(input.operations?.recoveryPctByMetal?.[metal], columnCount);
    if (!recoveryValues) continue;
    rows.push({ label: `Recovery ${metal} (%)`, values: recoveryValues });
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
    const royalties = input.economics?.royaltiesUSD?.[t] ?? 0;
    if (revenue === null || operatingCost === null || !Number.isFinite(revenue) || !Number.isFinite(operatingCost) || !Number.isFinite(royalties)) return null;
    return revenue - operatingCost - royalties;
  });
  if (metals.length > 0) rows.push({ label: 'Gross profit (USD)', values: grossProfit });

  const explicitEbitda = input.economics?.ebitdaUSD;
  const hasDepreciation = Array.isArray(input.economics?.depreciationUSD);
  const ebitda = Array.from({ length: columnCount }, (_, t) => {
    if (Array.isArray(explicitEbitda)) {
      const value = explicitEbitda[t] ?? null;
      return value !== null && Number.isFinite(value) ? value : null;
    }
    if (!hasDepreciation) return null;
    const ebit = input.economics?.ebitUSD?.[t] ?? null;
    const depreciation = input.economics?.depreciationUSD?.[t] ?? null;
    if (ebit === null || depreciation === null || !Number.isFinite(ebit) || !Number.isFinite(depreciation)) return null;
    return ebit + depreciation;
  });
  if (Array.isArray(input.economics?.ebitUSD)) {
    rows.push({ label: 'EBITDA (USD, includes royalties)', values: ebitda });
    rows.push({ label: 'EBIT (USD)', values: input.economics?.ebitUSD ?? [] });
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
