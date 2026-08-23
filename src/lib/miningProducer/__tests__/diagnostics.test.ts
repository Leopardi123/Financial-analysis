import { selectPresentedProducerDiagnostics } from '../diagnostics.ts';
import type { ProducerIntervalEconomics, ProducerIntervalMetric } from '../intervalEconomics.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function metric(low: number | null, high: number | null, diagnostics: string[] = []): ProducerIntervalMetric {
  return {
    range: low === null || high === null ? null : { low, high },
    quality: low === null || high === null ? 'not_computable' : 'range',
    diagnostics,
  };
}

function economics(basis: 'attributable' | 'financial', complete: boolean, diagnostics: string[] = []): ProducerIntervalEconomics {
  const value = complete ? metric(1, 2) : metric(null, null);
  return {
    year: 2030,
    basis,
    auOz: value,
    auEqOz: value,
    revenueUSD: value,
    ebitdaUSD: value,
    fcffBeforeGrowthUSD: value,
    fcffAfterGrowthUSD: value,
    growthCapexUSD: value,
    diagnostics,
  };
}

const diagnostics = selectPresentedProducerDiagnostics({
  year: 2030,
  liveDiagnostics: ['LIVE_MARKET_OK'],
  priceDeckDiagnostics: ['Au: commodity history resolved via historical-price-full'],
  forecastDiagnostics: [
    'FORECAST_RULE_APPLIED: mine/a materialized 2030 Au/produced',
    'FORECAST_RULE_APPLIED: mine/b materialized 2030 cash_operating_cost',
    'FORECAST_RULE_WARNING: retained explicit analyst assumption',
  ],
  scalarDiagnostics: [
    'mine/Au: range production claim must not be collapsed to a point estimate',
    'PROJECT_COST_COVERAGE_MISSING: mine/royaltiesUSD; another project\'s cost must not stand in for this project',
    'EBITDA: royaltiesUSD is missing; explicit zero is required when the economic amount is zero',
    'AISC_ONLY_NOT_CANONICAL: reported AISC is retained as reported data but is not converted into canonical EBITDA/FCFF',
    'Enterprise value unresolved: balanceSheet 2026-06-30 is stale after material event',
    'FINANCIAL_CONSOLIDATION_ROUTE: Au/AuEq remain attributable; Revenue/EBITDA/FCFF use verified project financialConsolidation where supplied.',
  ],
  intervals: {
    attributable: economics('attributable', true, ['mine/Au: produced used as revenue quantity proxy']),
    financial: economics('financial', true, ['mine/cash-cost: net-of-byproduct per-unit cost retained']),
  },
});

assert(diagnostics.includes('LIVE_MARKET_OK'), 'live diagnostic should remain');
assert(diagnostics.includes('Au: commodity history resolved via historical-price-full'), 'price-deck diagnostic should remain');
assert(diagnostics.some((item) => item.startsWith('FORECAST_RULES_APPLIED: 2 forecast rules materialized for 2030')), 'forecast application should be summarized');
assert(!diagnostics.some((item) => item.startsWith('FORECAST_RULE_APPLIED:')), 'individual forecast trace rows should not remain');
assert(diagnostics.includes('FORECAST_RULE_WARNING: retained explicit analyst assumption'), 'non-trace forecast warning should remain');
assert(diagnostics.includes('Enterprise value unresolved: balanceSheet 2026-06-30 is stale after material event'), 'EV blocker should remain');
assert(diagnostics.some((item) => item.startsWith('FINANCIAL_CONSOLIDATION_ROUTE:')), 'financial consolidation route should remain');
assert(diagnostics.includes('mine/Au: produced used as revenue quantity proxy'), 'interval production/revenue warning should remain');
assert(diagnostics.includes('mine/cash-cost: net-of-byproduct per-unit cost retained'), 'interval cost warning should remain');
assert(!diagnostics.some((item) => item.includes('range production claim must not be collapsed')), 'superseded scalar range warning should be removed');
assert(!diagnostics.some((item) => item.startsWith('PROJECT_COST_COVERAGE_MISSING:')), 'superseded scalar coverage warning should be removed');
assert(!diagnostics.some((item) => item.startsWith('EBITDA:')), 'superseded scalar EBITDA warning should be removed');
assert(!diagnostics.some((item) => item.startsWith('AISC_ONLY_NOT_CANONICAL:')), 'AISC-only scalar warning should be removed when canonical interval EBITDA exists');

const unresolved = selectPresentedProducerDiagnostics({
  year: 2030,
  liveDiagnostics: [],
  forecastDiagnostics: [],
  scalarDiagnostics: ['EBITDA: royaltiesUSD is missing; explicit zero is required when the economic amount is zero'],
  intervals: {
    attributable: economics('attributable', true),
    financial: economics('financial', false),
  },
});
assert(unresolved.some((item) => item.startsWith('EBITDA:')), 'scalar financial diagnostic must remain when financial interval route is unresolved');

console.log('Producer presented-diagnostics tests passed');
