import type { CashWaterfallResult } from '../financing/cashWaterfall.ts';

export type CorporateEquityValuePoint = {
  year: number;
  underlyingAssetValueTargetCurrency: number | null;
  openingCashTargetCurrency: number | null;
  openingDebtTargetCurrency: number | null;
  openingNetCashTargetCurrency: number | null;
  valueTargetCurrency: number | null;
};

export type CorporateEquityValueProductionStartPoint = CorporateEquityValuePoint & {
  projectIds: string[];
};

export type CorporateEquityValueOutput = {
  basis: 'opening_balance';
  definition: 'remaining_corporate_dcf_plus_opening_net_cash';
  valuationYear: number;
  current: CorporateEquityValuePoint | null;
  productionStarts: CorporateEquityValueProductionStartPoint[];
  diagnostics: string[];
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Isolated Corporate equity-value bridge for the explicit table rows.
 * Existing canonical NPV, NAV, DCF, financing and chart semantics are untouched.
 *
 * The valuation point for year Y uses remaining Corporate DCF from Y onward plus
 * the opening balance sheet for Y. This prevents the same year's FCFF from being
 * represented once in DCF and again in cash.
 */
export function buildCorporateEquityValue(args: {
  valuationYear: number;
  reportedCashTarget: number | null;
  reportedDebtTarget: number | null;
  fxUSDToTarget: number | null;
  waterfall: CashWaterfallResult | null;
  dcfByYear: Array<{ year: number; dcfTargetCurrency: number | null }>;
  productionStarts: Array<{ projectId: string; year: number }>;
}): CorporateEquityValueOutput {
  const diagnostics: string[] = [];
  const cashByYear = new Map<number, number | null>();
  const debtByYear = new Map<number, number | null>();
  const reportedCash = finite(args.reportedCashTarget) ? args.reportedCashTarget : null;
  const reportedDebt = finite(args.reportedDebtTarget) ? args.reportedDebtTarget : null;
  const fx = finite(args.fxUSDToTarget) && args.fxUSDToTarget > 0 ? args.fxUSDToTarget : null;

  if (reportedCash !== null) cashByYear.set(args.valuationYear, reportedCash);
  if (reportedDebt !== null) debtByYear.set(args.valuationYear, reportedDebt);

  if (args.waterfall && fx !== null && reportedCash !== null && reportedDebt !== null) {
    const reportedCashUsd = reportedCash / fx;
    const excludedCashUsd = reportedCashUsd - args.waterfall.initialCashAvailable;
    let openingDebtUsd: number | null = reportedDebt / fx;

    for (const row of args.waterfall.rows) {
      if (!finite(row.year)) continue;
      const openingCashTarget = finite(row.openingCash)
        ? (row.openingCash + excludedCashUsd) * fx
        : null;
      cashByYear.set(row.year, openingCashTarget);
      debtByYear.set(row.year, openingDebtUsd === null ? null : openingDebtUsd * fx);

      if (openingDebtUsd !== null) {
        openingDebtUsd = finite(row.debtAdded) ? openingDebtUsd + row.debtAdded : null;
      }
    }
  } else {
    if (!args.waterfall) diagnostics.push('Valuation-year cash waterfall unavailable; future opening balances are not computable.');
    if (fx === null) diagnostics.push('FX unavailable; future opening balances are not computable.');
    if (reportedCash === null) diagnostics.push('Reported cash unavailable.');
    if (reportedDebt === null) diagnostics.push('Reported debt unavailable.');
  }

  const dcfByYear = new Map(args.dcfByYear.map((row) => [row.year, row.dcfTargetCurrency]));
  const point = (year: number): CorporateEquityValuePoint => {
    const underlying = dcfByYear.get(year) ?? null;
    const cash = cashByYear.get(year) ?? null;
    const debt = debtByYear.get(year) ?? null;
    const netCash = finite(cash) && finite(debt) ? cash - debt : null;
    const value = finite(underlying) && netCash !== null ? underlying + netCash : null;
    return {
      year,
      underlyingAssetValueTargetCurrency: finite(underlying) ? underlying : null,
      openingCashTargetCurrency: finite(cash) ? cash : null,
      openingDebtTargetCurrency: finite(debt) ? debt : null,
      openingNetCashTargetCurrency: netCash,
      valueTargetCurrency: value,
    };
  };

  const projectsByYear = new Map<number, string[]>();
  for (const start of args.productionStarts) {
    if (!Number.isInteger(start.year)) continue;
    const ids = projectsByYear.get(start.year) ?? [];
    ids.push(start.projectId);
    projectsByYear.set(start.year, ids);
  }

  return {
    basis: 'opening_balance',
    definition: 'remaining_corporate_dcf_plus_opening_net_cash',
    valuationYear: args.valuationYear,
    current: dcfByYear.has(args.valuationYear) ? point(args.valuationYear) : null,
    productionStarts: [...projectsByYear.entries()]
      .sort(([left], [right]) => left - right)
      .map(([year, projectIds]) => ({ ...point(year), projectIds: [...projectIds].sort() })),
    diagnostics,
  };
}
