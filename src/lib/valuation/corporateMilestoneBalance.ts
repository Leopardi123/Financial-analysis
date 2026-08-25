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
 * - Cash that was deliberately excluded from the waterfall by cash-use settings
 *   remains on the balance sheet and is added back to each future closing-cash row.
 * - Debt is current debt plus cumulative modeled debt additions. Debt amortization
 *   is not invented because the current waterfall does not model it.
 * - Shares use the waterfall's cumulative canonical share count directly.
 * - Once a waterfall row is NOT_COMPUTABLE, future balance points fail closed.
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
    warnings.push('Waterfall initial cash exceeds reported cash; future NAV uses the waterfall closing-cash path without inventing additional retained cash.');
  }

  const rows = args.cashWaterfall?.rows ?? [];
  const firstWaterfallYear = rows
    .map((row) => row.year)
    .filter((year): year is number => Number.isInteger(year))
    .sort((a, b) => a - b)[0] ?? null;

  let cumulativeDebtAddedUSD = 0;
  let balanceComputable = fx !== null && finite(args.currentDebtTarget);
  const stateByYear = new Map<number, CorporateMilestoneBalance>();

  for (const row of rows) {
    if (!Number.isInteger(row.year) || (row.year as number) < args.valuationYear) continue;
    const year = row.year as number;

    if (row.status !== 'COMPUTABLE' || !finite(row.closingCash) || !finite(row.debtAdded)) {
      balanceComputable = false;
    }
    if (balanceComputable) cumulativeDebtAddedUSD += row.debtAdded as number;

    const cashTarget = balanceComputable && fx !== null && retainedCashOutsideWaterfallUSD !== null
      ? ((row.closingCash as number) + retainedCashOutsideWaterfallUSD) * fx
      : null;
    const debtTarget = balanceComputable && fx !== null && finite(args.currentDebtTarget)
      ? args.currentDebtTarget + cumulativeDebtAddedUSD * fx
      : null;
    const sharesPf = balanceComputable && finite(row.cumulativeCanonicalShares) && row.cumulativeCanonicalShares > 0
      ? row.cumulativeCanonicalShares
      : null;
    const cumulativeNewShares = balanceComputable && finite(row.cumulativeNewShares)
      ? row.cumulativeNewShares
      : null;

    if (!finite(row.cumulativeCanonicalShares) && balanceComputable) {
      warnings.push(`Future shares are not computable for ${year}; future per-share valuation fails closed from that row.`);
    }

    stateByYear.set(year, {
      year,
      cashTarget,
      debtTarget,
      sharesPf,
      cumulativeNewShares,
    });
  }

  let lastState: CorporateMilestoneBalance | null = null;
  const balances = args.years.map((year): CorporateMilestoneBalance => {
    if (year <= args.valuationYear) {
      return {
        year,
        cashTarget: finite(args.reportedCashTarget) ? args.reportedCashTarget : null,
        debtTarget: finite(args.currentDebtTarget) ? args.currentDebtTarget : null,
        sharesPf: finite(args.todaySharesPf) && args.todaySharesPf > 0
          ? args.todaySharesPf
          : (finite(args.currentShares) && args.currentShares > 0 ? args.currentShares : null),
        cumulativeNewShares: finite(args.todayNewSharesCumulative) ? args.todayNewSharesCumulative : 0,
      };
    }

    const exact = stateByYear.get(year) ?? null;
    if (exact) lastState = exact;

    // A future year before the first modeled waterfall row has no intervening
    // project cash-flow activity in the current model, so today's balance carries.
    if (firstWaterfallYear !== null && year < firstWaterfallYear) {
      return {
        year,
        cashTarget: finite(args.reportedCashTarget) ? args.reportedCashTarget : null,
        debtTarget: finite(args.currentDebtTarget) ? args.currentDebtTarget : null,
        sharesPf: finite(args.todaySharesPf) && args.todaySharesPf > 0
          ? args.todaySharesPf
          : (finite(args.currentShares) && args.currentShares > 0 ? args.currentShares : null),
        cumulativeNewShares: finite(args.todayNewSharesCumulative) ? args.todayNewSharesCumulative : 0,
      };
    }

    if (exact) return exact;
    if (lastState && lastState.year < year) return { ...lastState, year };

    // Once the model should have entered the waterfall horizon, missing data is
    // not silently replaced with today's balance sheet.
    return {
      year,
      cashTarget: null,
      debtTarget: null,
      sharesPf: null,
      cumulativeNewShares: null,
    };
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
