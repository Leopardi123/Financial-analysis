import { buildLiveProducerPeerTable } from '../../../server/miningProducer/buildLivePeerTable.ts';
import { materializeProducerForecastForYear } from '../forecast.ts';
import { validateProducerJsonV1 } from '../schema.ts';
import type {
  CostComponent,
  CostDisclosure,
  ForecastCostRule,
  ProducerJsonV1,
  Provenance,
} from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number | null | undefined, expected: number, message: string, tolerance = 1e-9): void {
  if (actual === null || actual === undefined || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${expected}, received ${String(actual)}`);
  }
}

const actual: Provenance = { sourceId: 'src_actual', estimateClass: 'actual' };
const scenario: Provenance = {
  sourceId: 'src_scenario',
  estimateClass: 'scenario',
  confidence: 'medium',
  confidenceReason: 'Synthetic analyst BASE forecast.',
};

function zeroCost(id: string, component: CostComponent, classification: CostDisclosure['canonicalClassification']): CostDisclosure {
  return {
    id,
    component,
    period: { kind: 'year', year: 2026 },
    economicBasis: component === 'corporate_gna' ? 'company' : 'project_100pct',
    canonicalClassification: classification,
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' },
    provenance: actual,
  };
}

const projectCosts: CostDisclosure[] = [
  {
    id: 'op',
    component: 'cash_operating_cost',
    period: { kind: 'year', year: 2026 },
    economicBasis: 'project_100pct',
    canonicalClassification: 'operating',
    model: {
      type: 'per_unit',
      amount: { kind: 'point', value: 1_000 },
      currency: 'USD',
      denominator: { metal: 'Au', unit: 'toz', measure: 'produced' },
      netOfByproductCredits: false,
    },
    provenance: actual,
  },
  zeroCost('roy', 'royalty', 'operating'),
  zeroCost('prod-tax', 'production_tax', 'operating'),
  zeroCost('tcrc', 'tc_rc', 'operating'),
  zeroCost('site', 'site_gna', 'operating'),
  zeroCost('other-op', 'other_recurring_operating', 'operating'),
  zeroCost('sust', 'sustaining_capex', 'sustaining'),
  zeroCost('sust-explore', 'sustaining_exploration', 'sustaining'),
  zeroCost('tax', 'cash_income_tax', 'tax'),
  zeroCost('wc', 'working_capital_delta', 'working_capital'),
  zeroCost('other-cash', 'other_cash', 'sustaining'),
  zeroCost('growth', 'growth_capex', 'growth'),
  zeroCost('growth-explore', 'growth_exploration', 'growth'),
];

const projectCostRules: ForecastCostRule[] = projectCosts.map((cost) => ({
  id: `forward-${cost.id}`,
  method: 'carry_forward',
  sourceCostId: cost.id,
  appliesTo: { startYear: 2027, endYear: 2030 },
  annualEscalationPct: 0,
  provenance: scenario,
}));

const producer: ProducerJsonV1 = {
  version: 'producer_json_v1',
  company: {
    id: 'FORECAST',
    name: 'Forecast Producer',
    primarySecurity: { ticker: 'FORECAST', exchange: 'TEST', quoteCurrency: 'USD', securityType: 'common' },
  },
  valuation: {
    valuationDateUtc: '2026-08-23',
    balanceSheet: {
      asOfDate: '2026-06-30',
      cashAndEquivalents: { value: 0, currency: 'USD', provenance: actual },
      totalDebt: { value: 0, currency: 'USD', provenance: actual },
    },
  },
  projects: [{
    id: 'mine',
    name: 'Mine',
    primaryMetal: 'Au',
    statusAsOfValuationDate: 'operating',
    financialConsolidation: { method: 'full', provenance: actual },
    ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance: actual }],
    production: [{
      id: 'prod-2026',
      metal: 'Au',
      measure: 'produced',
      period: { kind: 'year', year: 2026 },
      quantity: { kind: 'point', value: 100 },
      unit: 'toz',
      basis: 'project_100pct',
      provenance: actual,
    }, {
      id: 'medium-target',
      metal: 'Au',
      measure: 'sold',
      period: { kind: 'not_periodized', label: 'medium-term target' },
      quantity: { kind: 'approximate', value: 130 },
      unit: 'toz',
      basis: 'project_100pct',
      provenance: { sourceId: 'src_target', estimateClass: 'company_target' },
    }],
    costs: projectCosts,
    forecastAssumptions: {
      production: [{
        id: 'flat-prod',
        method: 'carry_forward',
        sourceDisclosureId: 'prod-2026',
        appliesTo: { startYear: 2027, endYear: 2030 },
        annualChangePct: 0,
        provenance: scenario,
      }],
      costs: projectCostRules,
    },
  }],
  corporateCosts: [zeroCost('corp-gna', 'corporate_gna', 'operating')],
  forecastAssumptions: {
    corporateCosts: [{
      id: 'forward-corp-gna',
      method: 'carry_forward',
      sourceCostId: 'corp-gna',
      appliesTo: { startYear: 2027, endYear: 2030 },
      annualEscalationPct: 0,
      provenance: scenario,
    }],
  },
  sources: [
    { id: 'src_actual', sourceType: 'financial_statement', publisher: 'Issuer', title: 'Synthetic actuals' },
    { id: 'src_target', sourceType: 'company_release', publisher: 'Issuer', title: 'Synthetic target' },
    { id: 'src_scenario', sourceType: 'other', publisher: 'Instrumentbrädan', title: 'Synthetic analyst BASE assumptions' },
  ],
};

async function run(): Promise<void> {
  validateProducerJsonV1(producer);

  const materialized = materializeProducerForecastForYear(producer, 2030);
  const mine = materialized.producer.projects[0];
  const forecastProd = mine.production.find((item) => item.id === 'forecast:flat-prod:2030');
  assert(forecastProd?.period.kind === 'year' && forecastProd.period.year === 2030, 'carry-forward materializes an exact-year forecast row');
  assert(forecastProd?.quantity.kind === 'approximate' && forecastProd.quantity.value === 100, 'source point becomes approximation-quality forecast point');
  assert(materialized.appliedRuleIds.includes('flat-prod'), 'applied production rule is reported');
  assert(producer.projects[0].production.every((item) => !item.id.startsWith('forecast:')), 'materialization does not mutate stored evidence');

  const periodizedSourceProducer: ProducerJsonV1 = {
    ...producer,
    projects: [{
      ...producer.projects[0],
      forecastAssumptions: {
        ...producer.projects[0].forecastAssumptions,
        production: [{
          id: 'periodized-target',
          method: 'periodize_source',
          sourceDisclosureId: 'medium-target',
          appliesTo: { startYear: 2029, endYear: 2031 },
          quantity: { kind: 'range', low: 120, high: 140 },
          provenance: scenario,
        }],
      },
    }],
  };
  const periodized = materializeProducerForecastForYear(periodizedSourceProducer, 2030).producer.projects[0].production.find((item) => item.id === 'forecast:periodized-target:2030');
  assert(periodized?.quantity.kind === 'range' && periodized.quantity.low === 120 && periodized.quantity.high === 140, 'periodize_source can convert a source target into an explicit closed scenario range');
  assert(periodized?.measure === 'sold', 'periodize_source retains source metal/measure/unit/basis');

  const result = await buildLiveProducerPeerTable({
    producers: [producer],
    context: { valuationDateUtc: '2026-08-23', selectedYear: 2030, priceMode: 'SPOT', caseMode: 'BASE' },
  }, {
    todayUtcFn: () => '2026-08-23',
    resolveProviderSymbolFn: async () => ({ symbol: 'FORECAST' }),
    fetchQuoteFn: async () => ({ price: 10, marketCap: 1_000_000, sharesOutstanding: 100_000 }),
    resolveFxFn: async () => ({ fx: 1, warnings: [] }),
    resolvePriceSeriesFn: (async () => ({ values: [2_000], warnings: [] })) as typeof import('../../prices/resolve.ts').resolvePriceSeries,
  });
  const row = result.table.rows[0];
  assertClose(row.auOz, 100, '2030 attributable production uses materialized carry-forward assumption');
  assertClose(row.revenueUSD, 200_000, '2030 financial revenue uses forecast production at selected spot price');
  assertClose(row.ebitdaUSD, 100_000, '2030 EBITDA uses carried-forward per-unit operating cost');
  assertClose(row.fcffBeforeGrowthUSD, 100_000, '2030 pre-growth FCFF uses carried-forward/explicit zero cost bridge');
  assertClose(row.fcffAfterGrowthUSD, 100_000, '2030 after-growth FCFF uses complete forecast bridge');
  assert(row.diagnostics.some((item) => item.includes('FORECAST_RULE_APPLIED')), 'peer diagnostics expose forecast assumptions');

  const explicit2030: ProducerJsonV1 = {
    ...producer,
    projects: [{
      ...producer.projects[0],
      production: [...producer.projects[0].production, {
        id: 'prod-2030-guidance',
        metal: 'Au',
        measure: 'produced',
        period: { kind: 'year', year: 2030 },
        quantity: { kind: 'point', value: 120 },
        unit: 'toz',
        basis: 'project_100pct',
        provenance: { sourceId: 'src_target', estimateClass: 'company_guidance' },
      }],
    }],
  };
  const explicitMaterialized = materializeProducerForecastForYear(explicit2030, 2030);
  assert(!explicitMaterialized.producer.projects[0].production.some((item) => item.id === 'forecast:flat-prod:2030'), 'explicit annual disclosure wins over forecast assumption');
  assert(explicitMaterialized.diagnostics.some((item) => item.includes('FORECAST_RULE_SKIPPED_EXPLICIT')), 'precedence decision is diagnostic');

  let invalidRejected = false;
  try {
    validateProducerJsonV1({
      ...producer,
      projects: [{
        ...producer.projects[0],
        forecastAssumptions: {
          ...producer.projects[0].forecastAssumptions,
          production: [{
            id: 'bad-provenance',
            method: 'carry_forward',
            sourceDisclosureId: 'prod-2026',
            appliesTo: { startYear: 2027, endYear: 2030 },
            annualChangePct: 0,
            provenance: { sourceId: 'src_target', estimateClass: 'company_guidance' },
          }],
        },
      }],
    });
  } catch {
    invalidRejected = true;
  }
  assert(invalidRejected, 'forecast rules cannot masquerade as company guidance/actual evidence');

  console.log('Mining Producer forecast assumption tests passed');
}

void run();
