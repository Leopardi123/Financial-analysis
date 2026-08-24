import { buildGminProducerJsonV1 } from '../data/gmin.ts';
import { normalizeProducerCompanyYear } from '../normalize.ts';
import { normalizeProductionDisclosureForYear } from '../production.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

async function run(): Promise<void> {
  const producer = buildGminProducerJsonV1('2026-08-22');

  assertEqual(producer.company.primarySecurity?.ticker, 'GMIN', 'GMIN primary ticker');
  assertEqual(producer.company.primarySecurity?.exchange, 'TSX', 'GMIN primary exchange');
  assertEqual(producer.company.primarySecurity?.quoteCurrency, 'CAD', 'GMIN primary quote currency');
  assertEqual(producer.valuation.sharesOutstanding, undefined, 'weighted-average shares are not copied into current shares');
  assertEqual(producer.valuation.balanceSheet?.asOfDate, '2026-06-30', 'latest disclosed balance date');
  assertEqual(producer.valuation.balanceSheet?.usability, 'stale_after_material_event', 'pre-G2-close balance marked stale');
  assertEqual(producer.valuation.balanceSheet?.cashAndEquivalents?.value, 225_734_000, 'Q2 cash disclosure');
  assertEqual(producer.valuation.balanceSheet?.totalDebt?.value, 33_019_000, 'Q2 long-term debt disclosure');

  const deck2026 = producer.reportedPriceDecks?.find((deck) => deck.id === 'gmin-guidance-2026');
  const deck2027 = producer.reportedPriceDecks?.find((deck) => deck.id === 'gmin-guidance-2027');
  assertEqual(deck2026?.metals?.Au.value, 4_300, '2026 reported gold-price assumption');
  assertEqual(deck2026?.fx?.BRL_per_USD, 5.15, '2026 reported BRL/USD assumption');
  assertEqual(deck2027?.metals?.Au.value, 4_000, '2027 reported gold-price assumption');
  assertEqual(deck2027?.fx?.BRL_per_USD, 5.55, '2027 reported BRL/USD assumption');

  const tz = producer.projects.find((project) => project.id === 'tocantinzinho');
  const oko = producer.projects.find((project) => project.id === 'oko');
  assert(tz, 'TZ project exists');
  assert(oko, 'Oko project exists');

  const tz2026 = tz?.production.find((item) => item.id === 'tz-au-produced-2026-guidance');
  assertEqual(tz2026?.quantity.kind, 'range', 'TZ 2026 range is preserved rather than midpointed');
  if (tz2026?.quantity.kind === 'range') {
    assertEqual(tz2026.quantity.low, 160, 'TZ 2026 guidance low');
    assertEqual(tz2026.quantity.high, 190, 'TZ 2026 guidance high');
  }

  const okoLom = oko?.production.find((item) => item.id === 'oko-combined-lom-average-target');
  assertEqual(okoLom?.period.kind, 'not_periodized', 'combined Oko 500koz LOM average is explicitly non-periodized');
  if (oko && okoLom) {
    assertEqual(normalizeProductionDisclosureForYear(oko, okoLom, 2030), null, 'Oko LOM average cannot become a 2030 annual value');
  }

  const fakeResolver = async (args: { price_key: string }) => ({
    values: [args.price_key === 'XAU_USD_TOZ' ? 4_500 : null],
    warnings: [] as string[],
  });

  const normalized2030 = await normalizeProducerCompanyYear({
    producer,
    context: {
      valuationDateUtc: '2026-08-22',
      selectedYear: 2030,
      priceMode: 'SPOT',
      caseMode: 'BASE',
    },
  }, { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries });

  assertEqual(normalized2030.metrics.revenueUSD, null, 'GMIN 2030 revenue remains unresolved without annual Oko/TZ production disclosure');
  assertEqual(normalized2030.physicalAuEqOz, null, 'GMIN 2030 AuEq is not fabricated from Oko LOM average');
  assert(
    normalized2030.diagnostics.some((item) => item.includes('no production disclosure covers 2030')),
    '2030 missing annual production is explicit',
  );

  const normalized2026 = await normalizeProducerCompanyYear({
    producer,
    context: {
      valuationDateUtc: '2026-08-22',
      selectedYear: 2026,
      priceMode: 'SPOT',
      caseMode: 'BASE',
    },
  }, { resolvePriceSeriesFn: fakeResolver as typeof import('../../prices/resolve.ts').resolvePriceSeries });

  assertEqual(normalized2026.producedByMetal.Au?.value, null, '2026 TZ production range is not midpointed into an exact company production figure');
  assertEqual(normalized2026.quality.revenue, 'not_computable', '2026 canonical revenue remains non-computable from range guidance');

  const preDeal = buildGminProducerJsonV1('2026-07-15');
  assertEqual(preDeal.valuation.balanceSheet?.usability, 'current_as_of_date', 'same Q2 balance is not marked post-deal stale before G2 close');

  console.log('Mining Producer GMIN sourced-data tests passed');
}

void run();
