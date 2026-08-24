import { resolveProducerMarketValue } from '../marketValue.ts';
import { normalizeProducerCompanyYear } from '../normalize.ts';
import type { CostDisclosure, ProducerJsonV1, ProducerProject, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

function assertClose(actual: number | null, expected: number, message: string, tolerance = 1e-9): void {
  if (actual === null || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${expected}, received ${String(actual)}`);
  }
}

const provenance: Provenance = { sourceId: 's1', estimateClass: 'company_guidance' };
const marketProvenance: Provenance = { sourceId: 'market', estimateClass: 'actual' };

function fixedCost(
  id: string,
  component: CostDisclosure['component'],
  canonicalClassification: CostDisclosure['canonicalClassification'],
  value: number,
): CostDisclosure {
  return {
    id,
    component,
    period: { kind: 'year', year: 2030 },
    economicBasis: 'attributable',
    canonicalClassification,
    model: { type: 'fixed_amount', amount: { kind: 'point', value }, currency: 'USD' },
    provenance,
  };
}

function completeProject(): ProducerProject {
  return {
    id: 'mine',
    name: 'Mine',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
    production: [
      {
        id: 'au-produced', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 },
        quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance,
      },
      {
        id: 'au-payable', metal: 'Au', measure: 'payable', period: { kind: 'year', year: 2030 },
        quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance,
      },
    ],
    costs: [
      fixedCost('op', 'cash_operating_cost', 'operating', 40_000),
      {
        id: 'royalty', component: 'royalty', period: { kind: 'year', year: 2030 },
        economicBasis: 'attributable', canonicalClassification: 'operating',
        model: { type: 'percent_revenue', rate: { kind: 'point', value: 0.05 }, revenueScope: { type: 'total_metal_revenue' } },
        provenance,
      },
      fixedCost('production-tax', 'production_tax', 'operating', 0),
      fixedCost('tcrc', 'tc_rc', 'operating', 0),
      fixedCost('site-gna', 'site_gna', 'operating', 5_000),
      fixedCost('other-op', 'other_recurring_operating', 'operating', 0),
      fixedCost('sustaining', 'sustaining_capex', 'sustaining', 10_000),
      fixedCost('sustaining-exploration', 'sustaining_exploration', 'sustaining', 0),
      fixedCost('cash-tax', 'cash_income_tax', 'tax', 20_000),
      fixedCost('wc', 'working_capital_delta', 'working_capital', 0),
      fixedCost('other-cash', 'other_cash', 'sustaining', 0),
      fixedCost('growth', 'growth_capex', 'growth', 7_000),
      fixedCost('growth-exploration', 'growth_exploration', 'growth', 0),
    ],
  };
}

function completeProducer(project = completeProject()): ProducerJsonV1 {
  return {
    version: 'producer_json_v1',
    company: { id: 'test', name: 'Test Gold' },
    valuation: {
      valuationDateUtc: '2026-08-22',
      reportedMarketCap: { value: 1_000_000, currency: 'USD', asOfDate: '2026-08-21', provenance: marketProvenance },
      sharesOutstanding: { value: 999, basis: 'weighted_average_basic', asOfDate: '2026-06-30', provenance: marketProvenance },
      balanceSheet: {
        asOfDate: '2026-06-30',
        totalDebt: { value: 100_000, currency: 'USD', provenance: marketProvenance },
        cashAndEquivalents: { value: 50_000, currency: 'USD', provenance: marketProvenance },
      },
    },
    projects: [project],
    corporateCosts: [fixedCost('corp-gna', 'corporate_gna', 'operating', 3_000)],
    sources: [
      { id: 's1', sourceType: 'company_release', publisher: 'Issuer', title: '2030 outlook' },
      { id: 'market', sourceType: 'other', publisher: 'Market provider', title: 'Market data' },
    ],
  };
}

const context = {
  valuationDateUtc: '2026-08-22',
  selectedYear: 2030,
  priceMode: 'SPOT' as const,
  caseMode: 'BASE' as const,
};

const fakeResolver = async (args: { price_key: string }) => ({
  values: [args.price_key === 'XAU_USD_TOZ' ? 2_000 : null],
  warnings: [] as string[],
});

async function run(): Promise<void> {
  const normalized = await normalizeProducerCompanyYear(
    { producer: completeProducer(), context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );

  assertClose(normalized.metrics.revenueUSD, 200_000, 'end-to-end revenue');
  assertClose(normalized.physicalAuEqOz, 100, 'end-to-end physical AuEq');
  assertClose(normalized.costBucketsUSD.royaltiesUSD, 10_000, 'royalty follows shared SPOT deck revenue');
  assertClose(normalized.metrics.ebitdaUSD, 142_000, 'canonical EBITDA');
  assertClose(normalized.metrics.fcffBeforeGrowthUSD, 112_000, 'FCFF before growth');
  assertClose(normalized.metrics.fcffAfterGrowthUSD, 105_000, 'FCFF after growth');
  assertEqual(normalized.quality.ebitda, 'exact', 'complete component EBITDA quality');
  assertEqual(normalized.quality.fcffBeforeGrowth, 'exact', 'complete component FCFF quality');
  assertClose(normalized.marketValue.marketCapUSD, 1_000_000, 'reported market cap preferred');
  assertEqual(normalized.marketValue.marketCapMethod, 'reported_market_cap', 'reported market cap precedence');
  assertClose(normalized.marketValue.enterpriseValueUSD, 1_050_000, 'EV bridge');
  assertClose(normalized.multiples.evToEbitda, 1_050_000 / 142_000, 'EV/EBITDA');
  assertClose(normalized.multiples.evToFcffBeforeGrowth, 9.375, 'EV/FCFF before growth');
  assertClose(normalized.multiples.evToFcffAfterGrowth, 10, 'EV/FCFF after growth');

  const missingTcRcProject = completeProject();
  missingTcRcProject.costs = missingTcRcProject.costs?.filter((item) => item.component !== 'tc_rc');
  const missingTcRc = await normalizeProducerCompanyYear(
    { producer: completeProducer(missingTcRcProject), context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertEqual(missingTcRc.metrics.revenueUSD, 200_000, 'missing cost does not erase valid revenue');
  assertEqual(missingTcRc.metrics.ebitdaUSD, null, 'missing TC/RC blocks EBITDA instead of defaulting to zero');
  assertEqual(missingTcRc.quality.ebitda, 'not_computable', 'missing TC/RC quality');
  assert(/explicit zero is required/.test(missingTcRc.diagnostics.join(' ')), 'missing cost diagnostic');

  const aiscProject: ProducerProject = {
    ...completeProject(),
    costs: [],
    reportedMetrics: [{
      id: 'aisc', scope: { type: 'project', projectId: 'mine' }, period: { kind: 'year', year: 2030 },
      metric: 'aisc', value: { kind: 'point', value: 1_200 }, unit: 'USD_per_toz', provenance,
    }],
  };
  const aiscOnly = await normalizeProducerCompanyYear(
    { producer: completeProducer(aiscProject), context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertEqual(aiscOnly.metrics.ebitdaUSD, null, 'AISC-only must not synthesize canonical EBITDA');
  assert(/AISC_ONLY_NOT_CANONICAL/.test(aiscOnly.diagnostics.join(' ')), 'AISC-only diagnostic');

  const fallbackProducer = completeProducer();
  fallbackProducer.valuation.reportedMarketCap = undefined;
  fallbackProducer.valuation.marketPrice = { value: 10, currency: 'CAD', asOfDate: '2026-08-21', provenance: marketProvenance };
  fallbackProducer.valuation.sharesOutstanding = { value: 100, basis: 'basic_actual', asOfDate: '2026-06-30', provenance: marketProvenance };
  const fallback = resolveProducerMarketValue({ producer: fallbackProducer, usdPerCurrencyUnitByCurrency: { CAD: 0.75 } });
  assertClose(fallback.marketCapUSD, 750, 'price times basic shares normalized to USD');
  assertEqual(fallback.marketCapMethod, 'price_times_basic_shares', 'basic-share fallback method');

  const weightedProducer = completeProducer();
  weightedProducer.valuation.reportedMarketCap = undefined;
  weightedProducer.valuation.marketPrice = { value: 10, currency: 'USD', asOfDate: '2026-08-21', provenance: marketProvenance };
  weightedProducer.valuation.sharesOutstanding = { value: 100, basis: 'weighted_average_basic', asOfDate: '2026-06-30', provenance: marketProvenance };
  const weighted = resolveProducerMarketValue({ producer: weightedProducer, usdPerCurrencyUnitByCurrency: {} });
  assertEqual(weighted.marketCapUSD, null, 'weighted-average shares cannot silently stand in for current shares');
  assert(/cannot be used as current basic shares/.test(weighted.diagnostics.join(' ')), 'weighted-share diagnostic');

  const missingDebtProducer = completeProducer();
  if (missingDebtProducer.valuation.balanceSheet) missingDebtProducer.valuation.balanceSheet.totalDebt = undefined;
  const missingDebt = resolveProducerMarketValue({ producer: missingDebtProducer, usdPerCurrencyUnitByCurrency: {} });
  assertEqual(missingDebt.enterpriseValueUSD, null, 'missing debt must not default to zero');

  assert(normalized.diagnostics.every((item) => !/weighted_average_basic/.test(item)), 'reported market cap should not be invalidated by unused weighted-average shares');
  console.log('Mining Producer end-to-end tests passed');
}

void run();
