import { buildProducerPeerTable } from '../peerTable.ts';
import type { CostDisclosure, ProducerJsonV1, Provenance } from '../types.ts';

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

function fixedCost(id: string, component: CostDisclosure['component'], classification: CostDisclosure['canonicalClassification']): CostDisclosure {
  return {
    id,
    component,
    period: { kind: 'year', year: 2030 },
    economicBasis: 'attributable',
    canonicalClassification: classification,
    model: { type: 'fixed_amount', amount: { kind: 'point', value: 0 }, currency: 'USD' },
    provenance,
  };
}

function completeZeroCosts(prefix: string): CostDisclosure[] {
  return [
    fixedCost(`${prefix}-op`, 'cash_operating_cost', 'operating'),
    fixedCost(`${prefix}-roy`, 'royalty', 'operating'),
    fixedCost(`${prefix}-prod-tax`, 'production_tax', 'operating'),
    fixedCost(`${prefix}-tcrc`, 'tc_rc', 'operating'),
    fixedCost(`${prefix}-site`, 'site_gna', 'operating'),
    fixedCost(`${prefix}-other-op`, 'other_recurring_operating', 'operating'),
    fixedCost(`${prefix}-sust`, 'sustaining_capex', 'sustaining'),
    fixedCost(`${prefix}-sust-explore`, 'sustaining_exploration', 'sustaining'),
    fixedCost(`${prefix}-tax`, 'cash_income_tax', 'tax'),
    fixedCost(`${prefix}-wc`, 'working_capital_delta', 'working_capital'),
    fixedCost(`${prefix}-other-cash`, 'other_cash', 'sustaining'),
    fixedCost(`${prefix}-growth`, 'growth_capex', 'growth'),
    fixedCost(`${prefix}-growth-explore`, 'growth_exploration', 'growth'),
  ];
}

function producer(id: string, marketCapUSD: number, reportedAuPrice = 1_800): ProducerJsonV1 {
  return {
    version: 'producer_json_v1',
    company: { id, name: id },
    valuation: {
      valuationDateUtc: '2026-08-22',
      reportedMarketCap: { value: marketCapUSD, currency: 'USD', asOfDate: '2026-08-21', provenance: marketProvenance },
      balanceSheet: {
        asOfDate: '2026-06-30',
        totalDebt: { value: 0, currency: 'USD', provenance: marketProvenance },
        cashAndEquivalents: { value: 0, currency: 'USD', provenance: marketProvenance },
      },
    },
    reportedPriceDecks: [{
      id: `${id}-reported`,
      label: `${id} reported deck`,
      metals: { Au: { value: reportedAuPrice, unit: 'USD_per_toz' } },
      provenance,
    }],
    projects: [{
      id: `${id}-mine`,
      name: `${id}-mine`,
      primaryMetal: 'Au',
      statusAsOfValuationDate: 'operating',
      ownership: [{ effectiveFrom: '2020-01-01', ownershipPct: 1, provenance }],
      production: [
        { id: `${id}-prod`, metal: 'Au', measure: 'produced', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance },
        { id: `${id}-pay`, metal: 'Au', measure: 'payable', period: { kind: 'year', year: 2030 }, quantity: { kind: 'point', value: 100 }, unit: 'toz', basis: 'attributable', provenance },
      ],
      costs: completeZeroCosts(id),
      reportedMetrics: [{
        id: `${id}-aisc`, scope: { type: 'project', projectId: `${id}-mine` }, period: { kind: 'year', year: 2030 },
        metric: 'aisc', value: { kind: 'point', value: 1_000 }, unit: 'USD_per_toz', provenance,
      }],
    }],
    corporateCosts: [fixedCost(`${id}-corp-gna`, 'corporate_gna', 'operating')],
    sources: [
      { id: 'company', sourceType: 'company_release', publisher: 'Issuer', title: 'Synthetic peer fixture' },
      { id: 'market', sourceType: 'other', publisher: 'Market', title: 'Synthetic market data' },
    ],
  };
}

async function run(): Promise<void> {
  let spotCalls = 0;
  const changingResolver = async () => {
    spotCalls += 1;
    return { values: [2_000 + ((spotCalls - 1) * 100)], warnings: [] as string[] };
  };

  const spot = await buildProducerPeerTable(
    {
      producers: [producer('A', 1_000_000), producer('B', 2_000_000)],
      context: { valuationDateUtc: '2026-08-22', selectedYear: 2030, priceMode: 'SPOT', caseMode: 'BASE' },
    },
    { resolvePriceSeriesFn: changingResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries },
  );

  assertEqual(spot.comparisonBasis, 'canonical_shared_deck', 'SPOT peer table uses canonical shared deck');
  assertEqual(spotCalls, 1, 'run-scoped SPOT resolver caches one Au price for all peers');
  assertEqual(spot.rows[0].priceDeckId, spot.rows[1].priceDeckId, 'peer rows share price deck id');
  assertClose(spot.rows[0].revenueUSD, 200_000, 'peer A revenue at shared SPOT');
  assertClose(spot.rows[1].revenueUSD, 200_000, 'peer B revenue at the exact same shared SPOT');
  assertClose(spot.rows[0].marketCapPerAuOzUSD, 10_000, 'market cap per Au ounce');
  assertClose(spot.rows[1].marketCapPerAuEqOzUSD, 20_000, 'market cap per AuEq ounce');
  assertClose(spot.rows[0].evToEbitda, 5, 'canonical EV/EBITDA');
  assertClose(spot.rows[1].evToFcffBeforeGrowth, 10, 'canonical EV/FCFF');
  assertEqual(spot.rows[0].reportedAisc?.metric, 'aisc', 'single-project reported AISC is surfaced as reported data');
  assertEqual(spot.rows[0].productionEstimateClasses[0], 'company_guidance', 'production estimate class surfaced');
  assert(/non-standard/.test(spot.rows[0].nonStandardMultiples.warning), 'P/EBITDA and P/FCFF are explicitly labelled non-standard');

  const reported = await buildProducerPeerTable({
    producers: [producer('A', 1_000_000, 1_800), producer('B', 2_000_000, 1_900)],
    context: { valuationDateUtc: '2026-08-22', selectedYear: 2030, priceMode: 'REPORTED', caseMode: 'BASE' },
    reportedPriceDeckIdByCompanyId: { A: 'A-reported', B: 'B-reported' },
  });
  assertEqual(reported.comparisonBasis, 'reported_source_decks', 'REPORTED mode is explicitly not canonical shared-deck comparison');
  assertClose(reported.rows[0].revenueUSD, 180_000, 'reported deck A preserved');
  assertClose(reported.rows[1].revenueUSD, 190_000, 'reported deck B preserved');
  assert(/not an apples-to-apples/.test(reported.diagnostics.join(' ')), 'REPORTED mode comparison warning');

  console.log('Mining Producer peer-table tests passed');
}

void run();
