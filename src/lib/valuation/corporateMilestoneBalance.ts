import type { CashWaterfallResult } from '../corporate/financing/cashWaterfall.ts';

export type CorporateMilestoneBalance = {
  year: number;
  cashTarget: number | null;
  debtTarget: number | null;
  sharesPf: number | null;
  cumulativeNewShares: number | null;
};

export type CorporateMilestoneBalanceDiagnostics = {
  retainedCashOutsideWaterfallUSD: number | null;
  firstWaterfallYear: number | null;
  warnings: string[];
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Converts the existing Corporate cash waterfall into the balance-sheet bridge
 * used by future NAV / target-price milestones.
 *
 * Important contracts:
 * - Project FCFF and the waterfall remain the economic/financing source of truth.
 * - A valuation for year t is a beginning-of-period value because canonical
 *   DCF[t] includes FCFF[t]. The balance paired with it must therefore be the
 *   opening balance before the current year's FCFF/financing, never closingCash[t].
 * - Operating cash generated in prior years may still reduce later funding needs
 *   inside the waterfall, but accumulated retained earnings are not capitalized
 *   into future NAV. Future NAV cash is normalized to the applicable minimum cash
 *   reserve plus cash deliberately excluded from the financing waterfall.
 * - Debt is current debt plus modeled debt additions from completed prior periods.
 *   Debt amortization is not invented because the current waterfall does not model it.
 * - Shares use the cumulative canonical share count from completed prior periods.
 * - A NOT_COMPUTABLE row does not invalidate the known opening balance for that
 *   row, but future balances fail closed after the row.
 */
export function buildCorporateMilestoneBalances(args: {
  years: number[];
  valuationYear: number;
  cashWaterfall: CashWaterfallResult | null;
  fxUSDToTarget: number | null;
  reportedCashTarget: number | null;
  currentDebtTarget: number | null;
  currentShares: number | null;
  todaySharesPf: number | null;
  todayNewSharesCumulative?: number | null;
}): {
  balances: CorporateMilestoneBalance[];
  diagnostics: CorporateMilestoneBalanceDiagnostics;
} {
  const warnings: string[] = [];
  const fx = finite(args.fxUSDToTarget) && args.fxUSDToTarget > 0 ? args.fxUSDToTarget : null;
  const reportedCashUSD = fx !== null && finite(args.reportedCashTarget)
    ? args.reportedCashTarget / fx
    : null;
  const initialWaterfallCashUSD = args.cashWaterfall && finite(args.cashWaterfall.initialCashAvailable)
    ? args.cashWaterfall.initialCashAvailable
    : null;
  const retainedCashOutsideWaterfallUSD = reportedCashUSD !== null && initialWaterfallCashUSD !== null
    ? Math.max(0, reportedCashUSD - Math.min(reportedCashUSD, initialWaterfallCashUSD))
    : null;

  if (
    reportedCashUSD !== null
    && initialWaterfallCashUSD !== null
    && initialWaterfallCashUSD > reportedCashUSD + 1e-8 * Math.max(1, reportedCashUSD)
  ) {
    warnings.push('Waterfall initial cash exceeds reported cash; normalized future NAV cash does not invent additional retained cash.');
  }

  const rows = [...(args.cashWaterfall?.rows ?? [])]
    .filter((row) => Number.isInteger(row.year))
    .sort((left, right) => (left.year as number) - (right.year as number) || left.period - right.period);
  const firstWaterfallYear = rows.length > 0 ? rows[0].year as number : null;

  const initialShares = finite(args.todaySharesPf) && args.todaySharesPf > 0
    ? args.todaySharesPf
    : (finite(args.currentShares) && args.currentShares > 0 ? args.currentShares : null);
  const initialCumulativeNewShares = finite(args.todayNewSharesCumulative)
    ? args.todayNewSharesCumulative
    : 0;

  let cumulativeDebtAddedUSD = 0;
  let openingShares = initialShares;
  let openingCumulativeNewShares: number | null = initialCumulativeNewShares;
  let futureComputable = fx !== null && finite(args.currentDebtTarget) && retainedCashOutsideWaterfallUSD !== null;
  let invalidAfterYear: number | null = null;

  const openingStateByYear = new Map<number, CorporateMilestoneBalance>();
  const postStateByYear = new Map<number, CorporateMilestoneBalance>();

  const normalizedCashTarget = (reserveUSD: unknown): number | null =>
    futureComputable && fx !== null && retainedCashOutsideWaterfallUSD !== null && finite(reserveUSD)
      ? (retainedCashOutsideWaterfallUSD + Math.max(0, reserveUSD)) * fx
      : null;

  for (const row of rows) {
    const year = row.year as number;
    if (year < args.valuationYear) continue;

    const openingState: CorporateMilestoneBalance = {
      year,
      cashTarget: normalizedCashTarget(row.minimumCashReserve),
      debtTarget: futureComputable && fx !== null && finite(args.currentDebtTarget)
        ? args.currentDebtTarget + cumulativeDebtAddedUSD * fx
        : null,
      sharesPf: futureComputable && finite(openingShares) && openingShares > 0 ? openingShares : null,
      cumulativeNewShares: futureComputable && finite(openingCumulativeNewShares) ? openingCumulativeNewShares : null,
    };
    openingStateByYear.set(year, openingState);

    const rowComputable = futureComputable
      && row.status === 'COMPUTABLE'
      && finite(row.debtAdded)
      && finite(row.cumulativeCanonicalShares)
      && row.cumulativeCanonicalShares > 0
      && finite(row.cumulativeNewShares)
      && finite(row.minimumCashReserve);

    if (!rowComputable) {
      if (invalidAfterYear === null) invalidAfterYear = year;
      futureComputable = false;
      if (!finite(row.cumulativeCanonicalShares) || row.cumulativeCanonicalShares <= 0) {
        warnings.push(`Future shares are not computable after ${year}; future per-share valuation fails closed after that row.`);
      }
      continue;
    }

    cumulativeDebtAddedUSD += row.debtAdded as number;
    openingShares = row.cumulativeCanonicalShares;
    openingCumulativeNewShares = row.cumulativeNewShares;

    postStateByYear.set(year, {
      year,
      cashTarget: normalizedCashTarget(row.minimumCashReserve),
      debtTarget: fx !== null && finite(args.currentDebtTarget)
        ? args.currentDebtTarget + cumulativeDebtAddedUSD * fx
        : null,
      sharesPf: openingShares,
      cumulativeNewShares: openingCumulativeNewShares,
    });
  }

  const currentBalance = (year: number): CorporateMilestoneBalance => ({
    year,
    cashTarget: finite(args.reportedCashTarget) ? args.reportedCashTarget : null,
    debtTarget: finite(args.currentDebtTarget) ? args.currentDebtTarget : null,
    sharesPf: initialShares,
    cumulativeNewShares: initialCumulativeNewShares,
  });

  const latestPostBefore = (year: number): CorporateMilestoneBalance | null => {
    let latest: CorporateMilestoneBalance | null = null;
    for (const [sourceYear, state] of postStateByYear.entries()) {
      if (sourceYear >= year) continue;
      if (latest === null || sourceYear > latest.year) latest = state;
    }
    return latest === null ? null : { ...latest, year };
  };

  const balances = args.years.map((year): CorporateMilestoneBalance => {
    if (year <= args.valuationYear) return currentBalance(year);

    if (firstWaterfallYear === null || year < firstWaterfallYear) {
      return currentBalance(year);
    }

    const exactOpening = openingStateByYear.get(year) ?? null;
    if (exactOpening) return exactOpening;

    if (invalidAfterYear !== null && year > invalidAfterYear) {
      return { year, cashTarget: null, debtTarget: null, sharesPf: null, cumulativeNewShares: null };
    }

    const carried = latestPostBefore(year);
    if (carried) return carried;

    return { year, cashTarget: null, debtTarget: null, sharesPf: null, cumulativeNewShares: null };
  });

  return {
    balances,
    diagnostics: {
      retainedCashOutsideWaterfallUSD,
      firstWaterfallYear,
      warnings,
    },
  };
}
