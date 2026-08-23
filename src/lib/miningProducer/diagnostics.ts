import type { ProducerIntervalEconomics } from './intervalEconomics.ts';

export type ProducerPresentedIntervalPair = {
  attributable: ProducerIntervalEconomics;
  financial: ProducerIntervalEconomics;
};

export type SelectPresentedProducerDiagnosticsArgs = {
  year: number;
  liveDiagnostics: readonly string[];
  forecastDiagnostics: readonly string[];
  scalarDiagnostics: readonly string[];
  priceDeckDiagnostics?: readonly string[];
  intervals?: ProducerPresentedIntervalPair;
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function hasRange(metric: { range: { low: number; high: number } | null }): boolean {
  return metric.range !== null;
}

function productionIntervalsComplete(intervals: ProducerPresentedIntervalPair | undefined): boolean {
  return Boolean(intervals
    && hasRange(intervals.attributable.auOz)
    && hasRange(intervals.attributable.auEqOz));
}

function financialIntervalsComplete(intervals: ProducerPresentedIntervalPair | undefined): boolean {
  return Boolean(intervals
    && hasRange(intervals.financial.revenueUSD)
    && hasRange(intervals.financial.ebitdaUSD)
    && hasRange(intervals.financial.fcffBeforeGrowthUSD)
    && hasRange(intervals.financial.fcffAfterGrowthUSD));
}

function isMarketValueOrRouteDiagnostic(value: string): boolean {
  return value.startsWith('Market cap')
    || value.startsWith('Enterprise value')
    || value.startsWith('reportedMarketCap')
    || value.startsWith('marketPrice')
    || value.startsWith('sharesOutstanding')
    || value.startsWith('ADR ')
    || value.startsWith('balanceSheet')
    || value.startsWith('totalDebt')
    || value.startsWith('cashAndEquivalents')
    || value.startsWith('preferredEquity')
    || value.startsWith('nonControllingInterest')
    || value.startsWith('leaseLiabilities')
    || value.startsWith('nonOperatingInvestments')
    || value.startsWith('EV adjustment ')
    || value.startsWith('FINANCIAL_CONSOLIDATION_ROUTE:');
}

function isScalarProductionDiagnostic(value: string): boolean {
  return value.includes('production claim must not be collapsed')
    || value.includes('production denominator is not scalar')
    || value.includes('multiple produced disclosures')
    || value.includes('denominator source precedence is unresolved')
    || value.includes('production completeness is unresolved')
    || value.includes('no production disclosure covers')
    || value.startsWith('PRODUCTION_EVIDENCE_NOT_AGGREGATED:')
    || value.startsWith('UNALLOCATED_REPORTING_GROUP:');
}

function isScalarFinancialDiagnostic(value: string): boolean {
  return value.startsWith('PROJECT_COST_COVERAGE_MISSING:')
    || value.startsWith('EBITDA:')
    || value.startsWith('FCFF before growth:')
    || value.startsWith('FCFF after growth:')
    || value.startsWith('AISC_ONLY_NOT_CANONICAL:')
    || value.includes('range cost claim must not be collapsed')
    || value.includes('Per-unit cost is net of by-product credits and cannot be used as canonical cost')
    || value.includes('Revenue base for ') && value.includes(' is not computable under selected price deck');
}

function scalarDiagnosticsRelevantToPresentedRoute(args: {
  scalarDiagnostics: readonly string[];
  productionComplete: boolean;
  financialComplete: boolean;
}): string[] {
  return args.scalarDiagnostics.filter((value) => {
    if (isMarketValueOrRouteDiagnostic(value)) return true;
    if (args.productionComplete && args.financialComplete) return false;
    if (args.productionComplete && isScalarProductionDiagnostic(value)) return false;
    if (args.financialComplete && isScalarFinancialDiagnostic(value)) return false;
    return true;
  });
}

function summarizeForecastDiagnostics(values: readonly string[], year: number): string[] {
  const appliedPrefix = 'FORECAST_RULE_APPLIED:';
  const applied = values.filter((value) => value.startsWith(appliedPrefix));
  const other = values.filter((value) => !value.startsWith(appliedPrefix));
  if (applied.length === 0) return [...other];
  return [
    `FORECAST_RULES_APPLIED: ${applied.length} forecast rules materialized for ${year}; inspect Corporate JSON for rule-level provenance.`,
    ...other,
  ];
}

/**
 * The live Producer run evaluates both the legacy scalar route and the range-native
 * interval route. The peer table may display interval economics even when the
 * scalar route correctly refuses to midpoint ranges. Diagnostics shown beside the
 * displayed values must therefore follow the route that actually produced them.
 *
 * Market-value/EV diagnostics remain relevant regardless of the operating route.
 * Forecast application is summarized rather than emitting one trace row per rule;
 * the rule-level provenance remains in the saved Corporate JSON.
 */
export function selectPresentedProducerDiagnostics(
  args: SelectPresentedProducerDiagnosticsArgs,
): string[] {
  const productionComplete = productionIntervalsComplete(args.intervals);
  const financialComplete = financialIntervalsComplete(args.intervals);
  const scalarDiagnostics = scalarDiagnosticsRelevantToPresentedRoute({
    scalarDiagnostics: args.scalarDiagnostics,
    productionComplete,
    financialComplete,
  });
  const intervalDiagnostics = args.intervals
    ? [...args.intervals.attributable.diagnostics, ...args.intervals.financial.diagnostics]
    : [];

  return unique([
    ...args.liveDiagnostics,
    ...(args.priceDeckDiagnostics ?? []),
    ...summarizeForecastDiagnostics(args.forecastDiagnostics, args.year),
    ...scalarDiagnostics,
    ...intervalDiagnostics,
  ]);
}
