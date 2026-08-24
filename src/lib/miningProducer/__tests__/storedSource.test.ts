import {
  assertStoredProducerMatchesSymbol,
  parseStoredProducerJson,
  prepareStoredProducerForRun,
  selectReportedPriceDeckIdForYear,
} from '../storedSource.ts';
import type { ProducerJsonV1 } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function baseProducer(): ProducerJsonV1 {
  return {
    version: 'producer_json_v1',
    company: {
      id: 'testco',
      name: 'Test Co',
      primarySecurity: {
        ticker: 'TST',
        exchange: 'TSX',
        quoteCurrency: 'CAD',
        securityType: 'common',
      },
    },
    valuation: { valuationDateUtc: '2026-01-01' },
    reportedPriceDecks: [
      {
        id: 'deck-2026',
        label: '2026 guidance deck',
        metals: { Au: { value: 3000, unit: 'USD_per_toz' } },
        provenance: { sourceId: 's1', estimateClass: 'company_guidance' },
        appliesTo: { year: 2026 },
      } as any,
      {
        id: 'deck-2027-2029',
        label: '2027-2029 guidance deck',
        metals: { Au: { value: 3100, unit: 'USD_per_toz' } },
        provenance: { sourceId: 's1', estimateClass: 'company_guidance' },
        appliesTo: { startYear: 2027, endYear: 2029 },
      } as any,
    ],
    projects: [],
    sources: [{ id: 's1', sourceType: 'company_release', publisher: 'Test Co', title: 'Guidance' }],
  };
}

const parsed = parseStoredProducerJson(JSON.stringify(baseProducer()));
assert(parsed.company.id === 'testco', 'stored JSON parses through producer_json_v1 validation');

const runtime = prepareStoredProducerForRun(parsed, '2026-08-23');
assert(runtime.valuation.valuationDateUtc === '2026-08-23', 'runtime valuation date overrides stored date');
assert(parsed.valuation.valuationDateUtc === '2026-01-01', 'stored source object is not mutated by runtime date');

assert(selectReportedPriceDeckIdForYear(parsed, 2026).id === 'deck-2026', 'point applicability selects reported deck');
assert(selectReportedPriceDeckIdForYear(parsed, 2028).id === 'deck-2027-2029', 'range applicability selects reported deck');
assert(selectReportedPriceDeckIdForYear(parsed, 2030).id === null, 'missing reported deck is not guessed');

assertStoredProducerMatchesSymbol(parsed, 'TST');
let mismatchThrown = false;
try {
  assertStoredProducerMatchesSymbol(parsed, 'OTHER');
} catch {
  mismatchThrown = true;
}
assert(mismatchThrown, 'storage symbol mismatch is rejected');

const ambiguous = baseProducer();
ambiguous.reportedPriceDecks = [
  ...(ambiguous.reportedPriceDecks ?? []),
  {
    id: 'deck-overlap',
    label: 'overlap',
    provenance: { sourceId: 's1', estimateClass: 'company_guidance' },
    appliesTo: { startYear: 2028, endYear: 2030 },
  } as any,
];
assert(selectReportedPriceDeckIdForYear(ambiguous, 2028).id === null, 'overlapping reported decks are ambiguous, not silently chosen');

console.log('Mining Producer stored-source tests passed');
