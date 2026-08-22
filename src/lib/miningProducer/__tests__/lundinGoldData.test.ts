import { buildLundinGoldProducerJsonV1 } from '../data/lundinGold.ts';
import { normalizeProducerCompanyYear } from '../normalize.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

async function run(): Promise<void> {
  const producer = buildLundinGoldProducerJsonV1('2026-08-22');
  const fdn = producer.projects.find((project) => project.id === 'fdn-district');
  assert(fdn, 'FDN district project exists');

  assertEqual(producer.company.primarySecurity?.ticker, 'LUG', 'Lundin Gold primary ticker');
  assertEqual(producer.company.primarySecurity?.exchange, 'TSX', 'Lundin Gold primary exchange');
  assertEqual(producer.company.primarySecurity?.quoteCurrency, 'CAD', 'Lundin Gold quote currency');
  assertEqual(producer.valuation.sharesOutstanding, undefined, 'older issued-share count is not used as a current fallback');
  assertEqual(producer.valuation.balanceSheet?.cashAndEquivalents?.value, 507_130_000, 'Q2 cash retained');
  assertEqual(producer.valuation.balanceSheet?.totalDebt, undefined, 'Q1 no-debt statement is not silently rolled forward to June 30');

  const deck = producer.reportedPriceDecks?.find((item) => item.id === 'lug-guidance-2026-2028');
  assertEqual(deck?.metals?.Au.value, 4_000, 'guidance Au assumption');
  assertEqual(deck?.metals?.Ag.value, 44, 'guidance Ag assumption');

  for (const year of [2026, 2027, 2028]) {
    const production = fdn?.production.find((item) => item.period.kind === 'year' && item.period.year === year);
    assertEqual(production?.quantity.kind, 'range', `${year} production remains a range`);
    if (production?.quantity.kind === 'range') {
      assertEqual(production.quantity.low, 475_000, `${year} production low`);
      assertEqual(production.quantity.high, 525_000, `${year} production high`);
    }
  }

  const stream = fdn?.metalStreams?.find((item) => item.id === 'fdn-lunr-silver-stream');
  assert(stream, 'LunR silver stream is retained as commercial evidence');
  assertEqual(stream?.effectiveFrom, '2026-03-01', 'silver stream effective date');
  assertEqual(stream?.tiers.length, 3, 'silver stream tier count');
  assertEqual(stream?.tiers[0].cumulativeDeliveryThresholdToz, 12_200_000, 'first silver threshold');
  assertEqual(stream?.tiers[0].streamedPayablePct, 1, 'first tier streamed percentage');
  assertEqual(stream?.tiers[0].ongoingPaymentPctSpot, 0.10, 'first tier ongoing payment');
  assertEqual(stream?.tiers[1].cumulativeDeliveryThresholdToz, 20_000_000, 'second threshold stored cumulatively');
  assertEqual(stream?.tiers[1].streamedPayablePct, 0.50, 'second tier streamed percentage');
  assertEqual(stream?.tiers[2].cumulativeDeliveryThresholdToz, null, 'final tier is life-of-mine');
  assertEqual(stream?.tiers[2].streamedPayablePct, 0.075, 'final tier streamed percentage');

  const aisc2026 = fdn?.reportedMetrics?.find((item) => item.id === 'fdn-aisc-2026-guidance');
  assertEqual(aisc2026?.provenance.sourceId, 'lug-2026-guidance-three-year-outlook', 'AISC range traces to guidance source');
  assertEqual(aisc2026?.definition?.definitionSourceId, 'lug-q1-2026-mda', 'AISC definition traces separately to MD&A');
  assertEqual(aisc2026?.definition?.netOfByproductCredits, true, 'reported AISC is explicitly net of silver revenue');

  const fakeResolver = async (args: { price_key: string }) => ({
    values: [args.price_key === 'XAU_USD_TOZ' ? 4_500 : args.price_key === 'XAG_USD_TOZ' ? 50 : null],
    warnings: [] as string[],
  });

  const normalized = await normalizeProducerCompanyYear({
    producer,
    context: {
      valuationDateUtc: '2026-08-22',
      selectedYear: 2027,
      priceMode: 'SPOT',
      caseMode: 'BASE',
    },
  }, { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries });

  assert(normalized.priceDeck.pricesByMetal.Ag !== undefined, 'Ag price is explicit in SPOT deck because an Ag stream is economically relevant');
  assertEqual(normalized.producedByMetal.Au?.value, null, 'annual gold guidance range is not midpointed');
  assertEqual(normalized.revenueByMetalUSD.Ag, undefined, 'silver revenue is not invented without payable Ag production and stream-stage state');
  assertEqual(normalized.metrics.revenueUSD, null, 'range guidance does not synthesize exact canonical revenue');
  assertEqual(normalized.metrics.ebitdaUSD, null, 'reported AISC does not synthesize canonical EBITDA');
  assertEqual(normalized.marketValue.enterpriseValueUSD, null, 'missing June 30 debt input keeps EV unresolved');
  assert(normalized.diagnostics.some((item) => item.includes('AISC_ONLY_NOT_CANONICAL')), 'reported AISC separation diagnostic');

  console.log('Mining Producer Lundin Gold sourced-data tests passed');
}

void run();
