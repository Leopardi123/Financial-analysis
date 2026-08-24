import { buildLiveProducerPeerTable } from '../../../server/miningProducer/buildLivePeerTable.ts';
import type { CostDisclosure, ProducerJsonV1, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number | null | undefined, expected: number, message: string, tolerance = 1e-9): void {
  if (actual === null || actual === undefined || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${expected}, received ${String(actual)}`);
  }
}

const provenance: Provenance = { sourceId: 'src', estimateClass: 'actual' };

function cost(id: string, component: CostDisclosure['component'], classification: CostDisclosure['canonicalClassification']): CostDisclosure {
  return {
    id,
    component,
    period: { kind: 'year', year: 2026 },
    economicBasis: component === 'corporate_gna' ? 'company' : 'project_100pct',
    canonicalClassification: classification,
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' },
    provenance,
  };
}

const projectCosts: CostDisclosure[] = [
  cost('op', 'cash_operating_cost', 'operating'),
  cost('roy', 'royalty', 'operating'),
  cost('prod-tax', 'production_tax', 'operating'),
  cost('tcrc', 'tc_rc', 'operating'),
  cost('site', 'site_gna', 'operating'),
  cost('other-op', 'other_recurring_operating', 'operating'),
  cost('sust', 'sustaining_capex', 'sustaining'),
  cost('sust-explore', 'sustaining_exploration', 'sustaining'),
  cost('tax', 'cash_income_tax', 'tax'),
  cost('wc', 'working_capital_delta', 'working_capital'),
  cost('other-cash', 'other_cash', 'sustaining'),
  cost('growth', 'growth_capex', 'growth'),
  cost('growth-explore', 'growth_exploration', 'growth'),
];

const producer: ProducerJsonV1 = {
  version: 'producer_json_v1',
  company: {
    id: 'CONS',
    name: 'Consolidated Producer',
    primarySecurity: { ticker: 'CONS', exchange: 'TEST', quoteCurrency: 'USD', securityType: 'common' },
  },
  valuation: {
    valuationDateUtc: '2026-08-23',
    balanceSheet: {
      asOfDate: '2026-06-30',
      cashAndEquivalents: { value: 0, currency: 'USD', provenance },
      totalDebt: { value: 0, currency: 'USD', provenance },
    },
  },
  projects: [
    {
      id: 'mine',
      name: 'Mine',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'operating',
      financialConsolidation: { method: 'full', provenance },
      ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 0.8, provenance }],
      production: [
        { id: 'prod', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2026 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'project_100pct', provenance },
        { id: 'pay', metal: 'Au', measure: 'payable', period: { kind: 'year', year: 2026 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'project_100pct', provenance },
      ],
      costs: projectCosts,
    },
    {
      id: 'future',
      name: 'Future Mine',
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'sanctioned',
      productionWindow: { startYear: 2028, provenance },
      financialConsolidation: { method: 'full', provenance },
      ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 0.7, provenance }],
      production: [
        { id: 'future-prod', metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2028 }, quantity: { kind: 'point', value: 50 }, unit: 'toz', basis: 'project_100pct', provenance },
      ],
    },
  ],
  corporateCosts: [cost('corp-gna', 'corporate_gna', 'operating')],
  sources: [{ id: 'src', sourceType: 'financial_statement', publisher: 'Issuer', title: 'Synthetic consolidation fixture' }],
};

async function run(): Promise<void> {
  const result = await buildLiveProducerPeerTable({
    producers: [producer],
    context: { valuationDateUtc: '2026-08-23', selectedYear: 2026, priceMode: 'SPOT', caseMode: 'BASE' },
  }, {
    todayUtcFn: () => '2026-08-23',
    resolveProviderSymbolFn: async () => ({ symbol: 'CONS' }),
    fetchQuoteFn: async () => ({ price: 8, marketCap: 800_000, sharesOutstanding: 100_000 }),
    resolveFxFn: async () => ({ fx: 1, warnings: [] }),
    resolvePriceSeriesFn: (async () => ({ values: [2_000], warnings: [] })) as typeof import('../../prices/resolve.ts').resolvePriceSeries,
  });

  const row = result.table.rows[0];
  assertClose(row.auOz, 80, 'Au remains attributable at 80% ownership');
  assertClose(row.revenueUSD, 200_000, 'Revenue uses 100% financial consolidation basis');
  assertClose(row.ebitdaUSD, 200_000, 'EBITDA uses 100% financial consolidation basis');
  assertClose(row.marketCapPerAuOzUSD, 10_000, 'Market Cap/Au remains equity-value over attributable Au');
  assertClose(row.evToEbitda, 4, 'EV/EBITDA uses consolidated EBITDA');
  assert(!row.diagnostics.some((item) => item.includes('future: no production disclosure covers 2026')), 'explicit future productionWindow prevents pre-production project from blocking 2026');
  assert(row.diagnostics.some((item) => item.includes('FINANCIAL_CONSOLIDATION_ROUTE')), 'row states financial consolidation route explicitly');

  console.log('Mining Producer financial-consolidation tests passed');
}

void run();
