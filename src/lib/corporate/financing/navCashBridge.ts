export type NavCashDefinition = 'reported_t0' | 'pro_forma_after_funding';

/** Resolves only the cash leg of NAV; funding and project DCF stay upstream. */
export function resolveCashForNav(input: {
  definition?: NavCashDefinition | null;
  reportedCash: number;
  initialCashUsedForFunding: number;
  minimumCashReserve?: number | null;
}): number {
  if (input.definition !== 'pro_forma_after_funding') return input.reportedCash;
  const reserve = Math.min(input.reportedCash, Math.max(0, input.minimumCashReserve ?? 0));
  return Math.max(reserve, input.reportedCash - Math.max(0, input.initialCashUsedForFunding));
}
