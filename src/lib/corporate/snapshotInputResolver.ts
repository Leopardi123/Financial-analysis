import type { SnapshotRequest } from '../api/validateSnapshotRequest.ts';
import { resolveCommonSharesCurrent } from '../market/resolveSharesCurrent.ts';

type StatementSeries = Record<string, Array<number | null> | undefined>;

type FinancingPlan = NonNullable<SnapshotRequest['financingPlan']>;
type FinancingPlanByProject = NonNullable<SnapshotRequest['financingPlanByProject']>;
type ProjectFinancingPlan = FinancingPlanByProject[string];

type Split = { equity: number; debt: number };

type SplitResolution =
  | { kind: 'NONE'; split: null }
  | { kind: 'OK'; split: Split }
  | { kind: 'INVALID'; split: null; diagnostic: string };

export type CanonicalCorporateSnapshotInputResolution = {
  request: SnapshotRequest | null;
  currentPriceTargetCurrency: number | null;
  sharesCurrent: number | null;
  cashCurrentTargetCurrency: number | null;
  debtCurrentTargetCurrency: number | null;
  targetCurrency: string | null;
  valuationYear: number;
  discountRate: number;
  manualExtraShares: number;
  diagnostics: string[];
  sourceAudit: {
    shares: 'STATEMENTS_COMMON' | 'PROFILE_SHARES_OUTSTANDING' | 'MISSING';
    cash: 'BALANCE.cashAndCashEquivalents' | 'MISSING';
    debt: 'BALANCE.totalDebt' | 'MISSING';
    price: 'PROFILE.price' | 'MISSING';
    targetCurrency: 'PROFILE.currency' | 'MISSING';
    financing: 'DEFAULT_100_EQUITY' | 'EXPLICIT';
    manualMetalPrices: 'SHARED_STORE' | 'NONE';
  };
};

const FRACTION_TOLERANCE = 1e-6;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const nonNegative = (value: unknown): value is number => finite(value) && value >= 0;

function latestFinite(values: Array<number | null> | undefined): number | null {
  if (!Array.isArray(values)) return null;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (finite(value)) return value;
  }
  return null;
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeProjectIds(projectIds: string[]): string[] {
  return [...new Set(projectIds.map((value) => value.trim()).filter(Boolean))];
}

function readTargetCurrency(profile: Record<string, unknown> | null): string | null {
  const value = typeof profile?.currency === 'string' ? profile.currency.trim().toUpperCase() : '';
  return value || null;
}

function resolveSplit(plan: ProjectFinancingPlan | FinancingPlan | undefined, label: string): SplitResolution {
  if (!plan) return { kind: 'NONE', split: null };
  const equityRaw = plan.equity_fraction;
  const debtRaw = plan.debt_fraction;
  if (equityRaw == null && debtRaw == null) return { kind: 'NONE', split: null };

  if (equityRaw != null && (!finite(equityRaw) || equityRaw < 0 || equityRaw > 1)) {
    return { kind: 'INVALID', split: null, diagnostic: `${label}.equity_fraction must be within [0, 1].` };
  }
  if (debtRaw != null && (!finite(debtRaw) || debtRaw < 0 || debtRaw > 1)) {
    return { kind: 'INVALID', split: null, diagnostic: `${label}.debt_fraction must be within [0, 1].` };
  }

  const equity = equityRaw ?? (1 - (debtRaw as number));
  const debt = debtRaw ?? (1 - (equityRaw as number));
  if (Math.abs(equity + debt - 1) > FRACTION_TOLERANCE) {
    return { kind: 'INVALID', split: null, diagnostic: `${label} debt/equity fractions must sum to 1.` };
  }
  return { kind: 'OK', split: { equity, debt } };
}

function sameAsCanonicalDefault(split: Split): boolean {
  return Math.abs(split.equity - 1) <= FRACTION_TOLERANCE && Math.abs(split.debt) <= FRACTION_TOLERANCE;
}

function normalizeCashUsePercent(value: unknown, diagnostics: string[]): number {
  if (value == null) return 1;
  if (!finite(value) || value < 0 || value > 1) {
    diagnostics.push('financingPlan.cash_use_percent invalid; canonical 100% cash-use cap policy applied.');
    return 1;
  }
  return value;
}

function normalizeManualExtraShares(value: unknown, diagnostics: string[]): number {
  if (Number.isSafeInteger(value) && (value as number) >= 0) return value as number;
  if (value != null) diagnostics.push('manualExtraShares invalid; canonical value 0 applied.');
  return 0;
}

function canonicalValuationYear(value: unknown, diagnostics: string[]): number {
  const current = new Date().getUTCFullYear();
  if (Number.isInteger(value) && (value as number) >= 1900 && (value as number) <= 2200) return value as number;
  if (value != null) diagnostics.push(`valuationYear invalid; current UTC year ${current} applied.`);
  return current;
}

function canonicalDiscountRate(value: unknown, diagnostics: string[]): number {
  if (finite(value) && value > 0 && value <= 0.25) return value;
  if (value != null) diagnostics.push('discountRate invalid; canonical Compare/Corporate policy 10% applied.');
  return 0.1;
}

function buildCanonicalFinancing(args: {
  projectIds: string[];
  currentPriceTargetCurrency: number;
  financingPlan?: SnapshotRequest['financingPlan'];
  financingPlanByProject?: SnapshotRequest['financingPlanByProject'];
  diagnostics: string[];
}): { financingPlan: FinancingPlan; financingPlanByProject?: FinancingPlanByProject; source: 'DEFAULT_100_EQUITY' | 'EXPLICIT' } | null {
  const globalSplit = resolveSplit(args.financingPlan, 'financingPlan');
  if (globalSplit.kind === 'INVALID') {
    args.diagnostics.push(globalSplit.diagnostic);
    return null;
  }

  const resolvedSplits = new Map<string, Split>();
  let hasInvalidProject = false;
  for (const projectId of args.projectIds) {
    const projectSplit = resolveSplit(args.financingPlanByProject?.[projectId], `financingPlanByProject.${projectId}`);
    if (projectSplit.kind === 'INVALID') {
      args.diagnostics.push(projectSplit.diagnostic);
      hasInvalidProject = true;
      continue;
    }
    if (projectSplit.kind === 'OK') {
      resolvedSplits.set(projectId, projectSplit.split);
      continue;
    }
    if (globalSplit.kind === 'OK') {
      resolvedSplits.set(projectId, globalSplit.split);
      continue;
    }
    resolvedSplits.set(projectId, { equity: 1, debt: 0 });
  }
  if (hasInvalidProject) return null;

  const hasNonDefaultSplit = [...resolvedSplits.values()].some((split) => !sameAsCanonicalDefault(split));
  const source: 'DEFAULT_100_EQUITY' | 'EXPLICIT' = hasNonDefaultSplit ? 'EXPLICIT' : 'DEFAULT_100_EQUITY';

  const useCashFirst = args.financingPlan?.use_cash_first === true;
  const cashUsePercent = normalizeCashUsePercent(args.financingPlan?.cash_use_percent, args.diagnostics);
  const minimumReserve = nonNegative(args.financingPlan?.minimum_cash_reserve_TargetCurrency)
    ? args.financingPlan?.minimum_cash_reserve_TargetCurrency as number
    : 0;
  if (args.financingPlan?.minimum_cash_reserve_TargetCurrency != null && !nonNegative(args.financingPlan.minimum_cash_reserve_TargetCurrency)) {
    args.diagnostics.push('financingPlan.minimum_cash_reserve_TargetCurrency invalid; canonical 0 reserve applied.');
  }
  const cashUseCap = nonNegative(args.financingPlan?.cash_use_cap_TargetCurrency)
    ? args.financingPlan?.cash_use_cap_TargetCurrency as number
    : undefined;
  if (args.financingPlan?.cash_use_cap_TargetCurrency != null && !nonNegative(args.financingPlan.cash_use_cap_TargetCurrency)) {
    args.diagnostics.push('financingPlan.cash_use_cap_TargetCurrency invalid and omitted.');
  }
  const raisePrice = positive(args.financingPlan?.equity_raise_price_TargetCurrency)
    ? args.financingPlan?.equity_raise_price_TargetCurrency as number
    : args.currentPriceTargetCurrency;

  const financingPlan: FinancingPlan = {
    use_cash_first: useCashFirst,
    cash_use_percent: cashUsePercent,
    minimum_cash_reserve_TargetCurrency: minimumReserve,
    ...(cashUseCap === undefined ? {} : { cash_use_cap_TargetCurrency: cashUseCap }),
    equity_raise_price_TargetCurrency: raisePrice,
  };

  let financingPlanByProject: FinancingPlanByProject | undefined;
  if (hasNonDefaultSplit) {
    const averageEquity = [...resolvedSplits.values()].reduce((sum, split) => sum + split.equity, 0) / resolvedSplits.size;
    financingPlan.equity_fraction = averageEquity;
    financingPlan.debt_fraction = 1 - averageEquity;
    financingPlanByProject = Object.fromEntries(
      args.projectIds.map((projectId) => {
        const split = resolvedSplits.get(projectId) ?? { equity: 1, debt: 0 };
        return [projectId, { equity_fraction: split.equity, debt_fraction: split.debt }];
      }),
    );
  }

  return { financingPlan, financingPlanByProject, source };
}

/**
 * Single canonical client-side input contract for Corporate and Compare · Pre Revenue.
 *
 * This resolver owns market/balance-sheet priorities, financing normalization,
 * manual-price passthrough, target-currency/FX policy and valuation policy. Consumers
 * may supply different UI state, but must not rebuild these economics locally.
 */
export function resolveCanonicalCorporateSnapshotInputs(args: {
  symbol: string;
  profile: Record<string, unknown> | null;
  statements: {
    balance?: StatementSeries | null;
    income?: StatementSeries | null;
  };
  projectIds: string[];
  financingPlan?: SnapshotRequest['financingPlan'];
  financingPlanByProject?: SnapshotRequest['financingPlanByProject'];
  manualExtraShares?: number;
  manualMetalPrices?: SnapshotRequest['manualMetalPrices'];
  discountRate?: number | null;
  valuationYear?: number | null;
  scenario?: SnapshotRequest['scenario'];
}): CanonicalCorporateSnapshotInputResolution {
  const diagnostics: string[] = [];
  const symbol = normalizeSymbol(args.symbol);
  const projectIds = normalizeProjectIds(args.projectIds);
  const valuationYear = canonicalValuationYear(args.valuationYear, diagnostics);
  const discountRate = canonicalDiscountRate(args.discountRate, diagnostics);
  const manualExtraShares = normalizeManualExtraShares(args.manualExtraShares, diagnostics);

  const targetCurrency = readTargetCurrency(args.profile);
  const statementShares = resolveCommonSharesCurrent({ balance: args.statements.balance, income: args.statements.income });
  const profileShares = positive(args.profile?.sharesOutstanding) ? args.profile?.sharesOutstanding as number : null;
  const sharesCurrent = statementShares ?? profileShares;
  const currentPriceTargetCurrency = positive(args.profile?.price) ? args.profile?.price as number : null;
  const cashCurrentTargetCurrency = latestFinite(args.statements.balance?.cashAndCashEquivalents);
  const debtCurrentTargetCurrency = latestFinite(args.statements.balance?.totalDebt);

  const sourceAudit: CanonicalCorporateSnapshotInputResolution['sourceAudit'] = {
    shares: statementShares !== null ? 'STATEMENTS_COMMON' : profileShares !== null ? 'PROFILE_SHARES_OUTSTANDING' : 'MISSING',
    cash: cashCurrentTargetCurrency !== null ? 'BALANCE.cashAndCashEquivalents' : 'MISSING',
    debt: debtCurrentTargetCurrency !== null ? 'BALANCE.totalDebt' : 'MISSING',
    price: currentPriceTargetCurrency !== null ? 'PROFILE.price' : 'MISSING',
    targetCurrency: targetCurrency !== null ? 'PROFILE.currency' : 'MISSING',
    financing: 'DEFAULT_100_EQUITY',
    manualMetalPrices: args.manualMetalPrices && Object.keys(args.manualMetalPrices).length > 0 ? 'SHARED_STORE' : 'NONE',
  };

  if (!symbol) diagnostics.push('Corporate symbol is missing.');
  if (projectIds.length === 0) diagnostics.push('No modeled projects are available for the Corporate snapshot.');
  if (targetCurrency === null) diagnostics.push('profile.currency is missing; target currency is not inferred.');
  if (sharesCurrent === null) diagnostics.push('Current shares are unavailable from canonical statements/profile sources.');
  if (currentPriceTargetCurrency === null) diagnostics.push('Current price is unavailable from profile.price.');
  if (cashCurrentTargetCurrency === null || !nonNegative(cashCurrentTargetCurrency)) diagnostics.push('Current cash is unavailable/invalid at balance.cashAndCashEquivalents.');
  if (debtCurrentTargetCurrency === null || !nonNegative(debtCurrentTargetCurrency)) diagnostics.push('Current debt is unavailable/invalid at balance.totalDebt.');

  if (
    !symbol
    || projectIds.length === 0
    || targetCurrency === null
    || sharesCurrent === null
    || currentPriceTargetCurrency === null
    || cashCurrentTargetCurrency === null
    || !nonNegative(cashCurrentTargetCurrency)
    || debtCurrentTargetCurrency === null
    || !nonNegative(debtCurrentTargetCurrency)
  ) {
    return {
      request: null,
      currentPriceTargetCurrency,
      sharesCurrent,
      cashCurrentTargetCurrency,
      debtCurrentTargetCurrency,
      targetCurrency,
      valuationYear,
      discountRate,
      manualExtraShares,
      diagnostics,
      sourceAudit,
    };
  }

  const financing = buildCanonicalFinancing({
    projectIds,
    currentPriceTargetCurrency,
    financingPlan: args.financingPlan,
    financingPlanByProject: args.financingPlanByProject,
    diagnostics,
  });
  if (!financing) {
    return {
      request: null,
      currentPriceTargetCurrency,
      sharesCurrent,
      cashCurrentTargetCurrency,
      debtCurrentTargetCurrency,
      targetCurrency,
      valuationYear,
      discountRate,
      manualExtraShares,
      diagnostics,
      sourceAudit,
    };
  }
  sourceAudit.financing = financing.source;

  const fx: SnapshotRequest['fx'] = targetCurrency === 'USD'
    ? { source: 'manual', anchor: 'today', scenario: { mode: 'spot' }, manual_fx_USD_to_TargetCurrency: 1 }
    : { source: 'auto', anchor: 'today', scenario: { mode: 'spot' } };

  const request: SnapshotRequest = {
    symbol,
    valuationYear,
    targetCurrency,
    discountRate,
    market: {
      shares_current: sharesCurrent,
      price_current_TargetCurrency: currentPriceTargetCurrency,
    },
    balanceSheet: {
      cash_t0_TargetCurrency: cashCurrentTargetCurrency,
      debt_t0_TargetCurrency: debtCurrentTargetCurrency,
    },
    financingPlan: financing.financingPlan,
    financingPlanByProject: financing.financingPlanByProject,
    scenario: args.scenario ?? { mode: 'spot' },
    fx,
    manualMetalPrices: args.manualMetalPrices,
  };

  return {
    request,
    currentPriceTargetCurrency,
    sharesCurrent,
    cashCurrentTargetCurrency,
    debtCurrentTargetCurrency,
    targetCurrency,
    valuationYear,
    discountRate,
    manualExtraShares,
    diagnostics,
    sourceAudit,
  };
}
