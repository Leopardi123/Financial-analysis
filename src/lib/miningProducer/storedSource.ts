import { validateProducerJsonV1 } from './schema.ts';
import type { ProducerJsonV1, ReportedPriceDeck } from './types.ts';

type DeckApplicability =
  | { year: number }
  | { startYear: number; endYear: number };

type StoredReportedPriceDeck = ReportedPriceDeck & {
  appliesTo?: DeckApplicability;
};

export function parseStoredProducerJson(rawJson: string): ProducerJsonV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`Invalid stored producer JSON: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored producer JSON root must be an object');
  }
  return validateProducerJsonV1(parsed as ProducerJsonV1);
}

export function prepareStoredProducerForRun(
  producer: ProducerJsonV1,
  valuationDateUtc: string,
): ProducerJsonV1 {
  return {
    ...producer,
    valuation: {
      ...producer.valuation,
      valuationDateUtc,
    },
  };
}

function deckAppliesToYear(deck: StoredReportedPriceDeck, year: number): boolean {
  const appliesTo = deck.appliesTo;
  if (!appliesTo) return false;
  if ('year' in appliesTo) return Number.isInteger(appliesTo.year) && appliesTo.year === year;
  return Number.isInteger(appliesTo.startYear)
    && Number.isInteger(appliesTo.endYear)
    && appliesTo.startYear <= year
    && year <= appliesTo.endYear;
}

export function selectReportedPriceDeckIdForYear(
  producer: ProducerJsonV1,
  year: number,
): { id: string | null; diagnostic?: string } {
  const decks = (producer.reportedPriceDecks ?? []) as StoredReportedPriceDeck[];
  const matching = decks.filter((deck) => deckAppliesToYear(deck, year));
  if (matching.length === 1) return { id: matching[0].id };
  if (matching.length > 1) {
    return {
      id: null,
      diagnostic: `REPORTED price deck is ambiguous for ${producer.company.name} ${year}: ${matching.map((deck) => deck.id).join(', ')}`,
    };
  }
  return {
    id: null,
    diagnostic: `REPORTED price deck unavailable for ${producer.company.name} ${year}; add reportedPriceDecks[].appliesTo to producer_json_v1`,
  };
}

export function assertStoredProducerMatchesSymbol(producer: ProducerJsonV1, symbol: string): void {
  const expected = symbol.trim().toUpperCase();
  const actual = producer.company.primarySecurity?.ticker?.trim().toUpperCase();
  if (!actual) throw new Error('company.primarySecurity.ticker is required for stored Corporate Producer JSON');
  if (actual !== expected) {
    throw new Error(`company.primarySecurity.ticker (${actual}) must match storage symbol ${expected}`);
  }
}
