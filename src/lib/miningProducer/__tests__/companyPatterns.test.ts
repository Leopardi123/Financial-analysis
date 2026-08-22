import { normalizeProducerCompanyYear } from '../normalize.ts';
import { resolveProducerMarketValue } from '../marketValue.ts';
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

const provenance: Provenance = { sourceId: 'company', estimateClass: 'company_guidance' };
const marketProvenance: Provenance = { sourceId: 'market', estimateClass: 'actual' };

function fixedCost(
  id: string,
  component: CostDisclosure['component'],
  classification: CostDisclosure['canonicalClassification'],
  value: number,
  currency = 'USD',
): CostDisclosure {
  return {
    id,
    component,
    period: { kind: 'year', year: 2030 },
    economicBasis: 'attributable',
    canonicalClassification: classification,
    model: { type: 'fixed_amount', amount: { kind: 'point', value }, currency },
    provenance,
  };
}

function completeZeroableCosts(prefix: string, cashOperating: CostDisclosure, royalty?: CostDisclosure): CostDisclosure[] {
  return [
    cashOperating,
    royalty ?? fixedCost(`${prefix}-roy`, 'royalty', 'operating', 0),
    fixedCost(`${prefix}-prod-tax`, 'production_tax', 'operating', 0),
    fixedCost(`${prefix}-tcrc`, 'tc_rc', 'operating', 0),
    fixedCost(`${prefix}-site`, 'site_gna', 'operating', 0),
    fixedCost(`${prefix}-other-op`, 'other_recurring_operating', 'operating', 0),
    fixedCost(`${prefix}-sust`, 'sustaining_capex', 'sustaining', 0),
    fixedCost(`${prefix}-sust-explore`, 'sustaining_exploration', 'sustaining', 0),
    fixedCost(`${prefix}-tax`, 'cash_income_tax', 'tax', 0),
    fixedCost(`${prefix}-wc`, 'working_capital_delta', 'working_capital', 0),
    fixedCost(`${prefix}-other-cash`, 'other_cash', 'sustaining', 0),
    fixedCost(`${prefix}-growth`, 'growth_capex', 'growth', 0),
    fixedCost(`${prefix}-growth-explore`, 'growth_exploration', 'growth', 0),
  ];
}

function goldProject(args: {
  id: string;
  status: ProducerProject['statusAsOfValuationDate'];
  ounces: number;
  costs: CostDisclosure[];
}): ProducerProject {
  return {
    id: args.id,
    name: args.id,
    primaryMetal: 'Au',
    statusAsOfValuationDate: args.status,
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
    production: [
      { id: `${args.id}-prod`, metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: args.ounces }, unit: 'toz', basis: 'attributable', provenance },
      { id: `${args.id}-pay`, metal: 'Au', measure: 'payable', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: args.ounces }, unit: 'toz', basis: 'attributable', provenance },
    ],
    costs: args.costs,
  };
}

function baseProducer(id: string, projects: ProducerProject[], corporateCosts: CostDisclosure[] = []): ProducerJsonV1 {
  return {
    version: 'producer_json_v1',
    company: { id, name: id },
    valuation: { valuationDateUtc: '2026-08-22' },
    projects,
    corporateCosts,
    sources: [{ id: 'company', sourceType: 'company_release', publisher: 'Issuer', title: 'Synthetic disclosure-pattern fixture' }],
  };
}

const context = {
  valuationDateUtc: '2026-08-22',
  selectedYear: 2030,
  priceMode: 'SPOT' as const,
  caseMode: 'BASE' as const,
};

const fakeResolver = async (args: { price_key: string }) => ({
  values: [args.price_key === 'XAU_USD_TOZ' ? 2_000 : args.price_key === 'XAG_USD_TOZ' ? 20 : null],
  warnings: [] as string[],
});

async function run(): Promise<void> {
  // GMIN-style synthetic pattern: operating asset + development asset, with explicit local-currency cost exposure.
  const gminOperating = goldProject({
    id: 'gmin-operating-pattern',
    status: 'operating',
    ounces: 100,
    costs: completeZeroableCosts(
      'gmin-op',
      fixedCost('gmin-op-cash', 'cash_operating_cost', 'operating', 100_000, 'BRL'),
    ),
  });
  const gminDevelopment = goldProject({
    id: 'gmin-development-pattern',
    status: 'development',
    ounces: 50,
    costs: completeZeroableCosts(
      'gmin-dev',
      fixedCost('gmin-dev-cash', 'cash_operating_cost', 'operating', 50_000, 'BRL'),
    ),
  });
  const gmin = baseProducer('GMIN_PATTERN', [gminOperating, gminDevelopment], [fixedCost('gmin-corp-gna', 'corporate_gna', 'operating', 0)]);

  const gminMissingFx = await normalizeProducerCompanyYear(
    { producer: gmin, context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertEqual(gminMissingFx.metrics.ebitdaUSD, null, 'GMIN-style local-currency costs require explicit FX; FX is not inferred');

  const gminBase = await normalizeProducerCompanyYear(
    { producer: gmin, context, usdPerCurrencyUnitByCurrency: { BRL: 0.2 } },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertClose(gminBase.metrics.revenueUSD, 200_000, 'GMIN-style BASE includes operating asset only');
  assertClose(gminBase.costBucketsUSD.cashOperatingCostsUSD, 20_000, 'GMIN-style BRL cost converts only from explicit FX');

  const gminGrowth = await normalizeProducerCompanyYear(
    { producer: gmin, context: { ...context, caseMode: 'GROWTH' }, usdPerCurrencyUnitByCurrency: { BRL: 0.2 } },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertClose(gminGrowth.metrics.revenueUSD, 300_000, 'GMIN-style GROWTH adds explicit development-asset production');
  assertClose(gminGrowth.costBucketsUSD.cashOperatingCostsUSD, 30_000, 'GMIN-style GROWTH includes development-asset costs too');

  // Lundin-style synthetic pattern: reported AISC is net of silver credits, while canonical economics use metal revenue + components.
  const lundinProject: ProducerProject = {
    ...goldProject({
      id: 'lundin-pattern',
      status: 'operating',
      ounces: 100,
      costs: completeZeroableCosts('lundin', fixedCost('lundin-cash', 'cash_operating_cost', 'operating', 80_000)),
    }),
    production: [
      { id: 'lundin-au-prod', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance },
      { id: 'lundin-au-pay', metal: 'Au', measure: 'payable', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance },
      { id: 'lundin-ag-prod', metal: 'Ag', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 1_000 }, unit: 'toz', basis: 'attributable', provenance },
      { id: 'lundin-ag-pay', metal: 'Ag', measure: 'payable', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 1_000 }, unit: 'toz', basis: 'attributable', provenance },
    ],
    reportedMetrics: [{
      id: 'lundin-reported-aisc', scope: { type: 'project', projectId: 'lundin-pattern' }, period: { kind: 'year', year: 2030 },
      metric: 'aisc', value: { kind: 'point', value: 900 }, unit: 'USD_per_toz',
      definition: { netOfByproductCredits: true }, provenance,
    }],
  };
  const lundin = baseProducer('LUNDIN_PATTERN', [lundinProject], [fixedCost('lundin-corp-gna', 'corporate_gna', 'operating', 0)]);
  const lundinResult = await normalizeProducerCompanyYear(
    { producer: lundin, context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertClose(lundinResult.metrics.revenueUSD, 220_000, 'Lundin-style canonical revenue includes Au and Ag exactly once');
  assertClose(lundinResult.metrics.ebitdaUSD, 140_000, 'Lundin-style reported net-of-credit AISC does not alter canonical EBITDA');
  assertEqual(lundinResult.quality.ebitda, 'exact', 'reported AISC remains separate when full canonical components exist');

  // B2Gold-style synthetic pattern: explicit price-linked cost sensitivity can be repriced to the shared deck.
  const b2Royalty: CostDisclosure = {
    id: 'b2-price-linked-royalty',
    component: 'royalty',
    period: { kind: 'year', year: 2030 },
    economicBasis: 'attributable',
    canonicalClassification: 'operating',
    model: {
      type: 'price_linked',
      referenceValue: { kind: 'point', value: 100 },
      output: { kind: 'per_unit', currency: 'USD', denominator: { metal: 'Au', unit: 'toz', measure: 'produced' } },
      sensitivities: [{ driverMetal: 'Au', referencePrice: 1_900, driverPriceUnit: 'USD_per_toz', slope: 0.12 }],
      sourcePriceDeckRef: 'reported-reference',
    },
    provenance,
  };
  const b2Project = goldProject({
    id: 'b2-pattern',
    status: 'operating',
    ounces: 100,
    costs: completeZeroableCosts('b2', fixedCost('b2-cash', 'cash_operating_cost', 'operating', 50_000), b2Royalty),
  });
  const b2 = baseProducer('B2_PATTERN', [b2Project], [fixedCost('b2-corp-gna', 'corporate_gna', 'operating', 0)]);
  const b2Result = await normalizeProducerCompanyYear(
    { producer: b2, context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertClose(b2Result.costBucketsUSD.royaltiesUSD, 11_200, 'B2-style +100 Au move adds 12/oz to price-linked cost over 100 oz');
  assertClose(b2Result.metrics.ebitdaUSD, 138_800, 'B2-style repriced price-linked cost flows into canonical EBITDA');

  // Allied-style synthetic pattern: a multi-year average must not become a fabricated precise 2030 production number.
  const alliedProject: ProducerProject = {
    id: 'allied-pattern',
    name: 'allied-pattern',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
    production: [{
      id: 'allied-multi-year', metal: 'Au', measure: 'produced',
      period: { kind: 'year_range_average', startYear: 2030, endYear: 2033 },
      quantity: { kind: 'approximate', value: 400 }, unit: 'koz', basis: 'attributable', provenance,
    }],
    costs: completeZeroableCosts('allied', fixedCost('allied-cash', 'cash_operating_cost', 'operating', 1)),
  };
  const allied = baseProducer('ALLIED_PATTERN', [alliedProject], [fixedCost('allied-corp-gna', 'corporate_gna', 'operating', 0)]);
  const alliedResult = await normalizeProducerCompanyYear(
    { producer: allied, context },
    { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );
  assertEqual(alliedResult.metrics.revenueUSD, null, 'Allied-style multi-year average does not fabricate 2030 revenue');
  assertEqual(alliedResult.quality.revenue, 'not_computable', 'Allied-style precise-year revenue remains not computable');
  assert(alliedResult.productionItems.some((item) => /must not be materialized/.test(item.reason ?? '')), 'Allied-style no-false-precision diagnostic');

  // ADR market-cap fallback remains blocked until share-class/ADR normalization is explicit.
  const adrProducer = baseProducer('ADR_PATTERN', []);
  adrProducer.company.primarySecurity = { ticker: 'ADR', quoteCurrency: 'USD', securityType: 'adr', adrRatio: 2 };
  adrProducer.valuation.marketPrice = { value: 10, currency: 'USD', asOfDate: '2026-08-21', provenance: marketProvenance };
  adrProducer.valuation.sharesOutstanding = { value: 100, basis: 'basic_actual', asOfDate: '2026-06-30', provenance: marketProvenance };
  const adr = resolveProducerMarketValue({ producer: adrProducer, usdPerCurrencyUnitByCurrency: {} });
  assertEqual(adr.marketCapUSD, null, 'ADR price-times-shares fallback is blocked despite an ADR ratio field');
  assert(/ADR price-times-shares fallback is disabled/.test(adr.diagnostics.join(' ')), 'ADR ambiguity diagnostic');

  console.log('Mining Producer company-pattern tests passed');
}

void run();
