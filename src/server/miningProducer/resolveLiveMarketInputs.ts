import { fetchStableJson } from '../../../api/_fmp.js';
import type { ProducerJsonV1, Provenance, SourceRef } from '../../lib/miningProducer/types.ts';

type StableFetch = (
  path: string,
  query?: Record<string, string | number | null | undefined>,
) => Promise<unknown>;

type FmpSecurityCandidate = {
  symbol: string;
  currency: string;
  exchange: string | null;
};

export type LiveProducerMarketInputs = {
  producer: ProducerJsonV1;
  providerSymbol: string | null;
  usdPerCurrencyUnitByCurrency: Record<string, number>;
  diagnostics: string[];
};

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function parseSecurityCandidates(value: unknown): FmpSecurityCandidate[] {
  return rows(value)
    .map((row) => {
      const symbol = nonEmptyString(row.symbol);
      const currency = nonEmptyString(row.currency);
      if (!symbol || !currency) return null;
      return {
        symbol,
        currency: normalized(currency),
        exchange: nonEmptyString(row.exchangeShortName) ?? nonEmptyString(row.exchange),
      };
    })
    .filter((candidate): candidate is FmpSecurityCandidate => candidate !== null);
}

function securitySymbolMatchesTicker(symbol: string, ticker: string): boolean {
  const symbolUpper = normalized(symbol);
  const tickerUpper = normalized(ticker);
  return symbolUpper === tickerUpper || symbolUpper.startsWith(`${tickerUpper}.`);
}

function resolveSecurityCandidate(
  candidates: readonly FmpSecurityCandidate[],
  security: NonNullable<ProducerJsonV1['company']['primarySecurity']>,
): { candidate: FmpSecurityCandidate | null; diagnostic?: string } {
  const expectedCurrency = normalized(security.quoteCurrency);
  const expectedExchange = normalized(security.exchange);
  const tickerMatches = candidates.filter((candidate) => securitySymbolMatchesTicker(candidate.symbol, security.ticker));
  const currencyMatches = tickerMatches.filter((candidate) => candidate.currency === expectedCurrency);
  const exchangeMatches = expectedExchange
    ? currencyMatches.filter((candidate) => normalized(candidate.exchange) === expectedExchange)
    : currencyMatches;

  if (exchangeMatches.length === 1) return { candidate: exchangeMatches[0] };
  if (exchangeMatches.length > 1) {
    return {
      candidate: null,
      diagnostic: `FMP security resolution ambiguous for ${security.ticker}: ${exchangeMatches.map((item) => item.symbol).join(', ')}`,
    };
  }

  return {
    candidate: null,
    diagnostic: `FMP security resolution failed for ticker=${security.ticker}, exchange=${security.exchange ?? 'unspecified'}, currency=${security.quoteCurrency}; no exact searched candidate matched`,
  };
}

async function resolveUsdPerCurrencyUnit(args: {
  currency: string;
  fetchStable: StableFetch;
  forexList?: unknown;
}): Promise<{ value: number | null; pairSymbol: string | null; diagnostic?: string; forexList?: unknown }> {
  const currency = normalized(args.currency);
  if (currency === 'USD') return { value: 1, pairSymbol: null, forexList: args.forexList };

  const forexList = args.forexList ?? await args.fetchStable('forex-list');
  const availableSymbols = new Set(
    rows(forexList)
      .map((row) => nonEmptyString(row.symbol))
      .filter((symbol): symbol is string => symbol !== null)
      .map(normalized),
  );

  const direct = `${currency}USD`;
  const inverse = `USD${currency}`;
  let pairSymbol: string | null = null;
  let invert = false;

  if (availableSymbols.has(direct)) {
    pairSymbol = direct;
  } else if (availableSymbols.has(inverse)) {
    pairSymbol = inverse;
    invert = true;
  } else {
    return {
      value: null,
      pairSymbol: null,
      forexList,
      diagnostic: `FMP forex-list contains neither ${direct} nor ${inverse}; FX series is unresolved and must not be guessed`,
    };
  }

  const quote = rows(await args.fetchStable('quote', { symbol: pairSymbol }))[0];
  const price = finiteNumber(quote?.price);
  if (price === null || price <= 0) {
    return {
      value: null,
      pairSymbol,
      forexList,
      diagnostic: `FMP quote for verified FX pair ${pairSymbol} has no finite positive price`,
    };
  }

  return {
    value: invert ? 1 / price : price,
    pairSymbol,
    forexList,
  };
}

function appendSource(producer: ProducerJsonV1, source: SourceRef): ProducerJsonV1 {
  const sources = producer.sources.some((candidate) => candidate.id === source.id)
    ? producer.sources
    : [...producer.sources, source];
  return { ...producer, sources };
}

export async function resolveLiveProducerMarketInputs(
  producer: ProducerJsonV1,
  deps: {
    fetchStable?: StableFetch;
    todayUtcFn?: () => string;
  } = {},
): Promise<LiveProducerMarketInputs> {
  const diagnostics: string[] = [];
  const fetchStable: StableFetch = deps.fetchStable ?? ((path, query) => fetchStableJson<unknown>(path, query));
  const todayUtc = (deps.todayUtcFn ?? (() => new Date().toISOString().slice(0, 10)))();
  const valuationDateUtc = producer.valuation.valuationDateUtc;

  if (valuationDateUtc !== todayUtc) {
    diagnostics.push(
      `Live market resolver refused: valuationDateUtc=${valuationDateUtc} differs from current UTC date ${todayUtc}; current FMP snapshot must not be used for a historical valuation date`,
    );
    return { producer, providerSymbol: null, usdPerCurrencyUnitByCurrency: {}, diagnostics };
  }

  const security = producer.company.primarySecurity;
  if (!security) {
    diagnostics.push('Live market resolver requires company.primarySecurity; ticker/exchange/currency must not be inferred');
    return { producer, providerSymbol: null, usdPerCurrencyUnitByCurrency: {}, diagnostics };
  }

  const searchResult = await fetchStable('search-symbol', { query: security.ticker });
  const resolution = resolveSecurityCandidate(parseSecurityCandidates(searchResult), security);
  if (!resolution.candidate) {
    diagnostics.push(resolution.diagnostic ?? 'FMP security resolution failed');
    return { producer, providerSymbol: null, usdPerCurrencyUnitByCurrency: {}, diagnostics };
  }

  const candidate = resolution.candidate;
  const providerSymbol = candidate.symbol;
  const quoteCurrency = candidate.currency;
  const sourceId = `fmp-market:${providerSymbol}:${valuationDateUtc}`;
  const provenance: Provenance = {
    sourceId,
    estimateClass: 'actual',
    confidence: 'high',
    confidenceReason: 'Provider symbol resolved by ticker + declared exchange + declared quote currency; current market fields read directly from FMP stable endpoints.',
  };
  const providerSource: SourceRef = {
    id: sourceId,
    sourceType: 'other',
    publisher: 'Financial Modeling Prep',
    title: `Live market snapshot for ${providerSymbol}`,
    publishedDate: valuationDateUtc,
  };

  let hydrated = appendSource(producer, providerSource);
  const usdPerCurrencyUnitByCurrency: Record<string, number> = {};
  let forexList: unknown | undefined;

  const fx = await resolveUsdPerCurrencyUnit({ currency: quoteCurrency, fetchStable, forexList });
  forexList = fx.forexList;
  if (fx.value === null) {
    diagnostics.push(fx.diagnostic ?? `FX unresolved for ${quoteCurrency}`);
  } else {
    usdPerCurrencyUnitByCurrency[quoteCurrency] = fx.value;
    if (fx.pairSymbol) diagnostics.push(`FX ${quoteCurrency}->USD resolved through verified FMP forex-list pair ${fx.pairSymbol}`);
  }

  const marketCapRows = rows(await fetchStable('market-capitalization', { symbol: providerSymbol }));
  const marketCap = finiteNumber(marketCapRows[0]?.marketCap);
  if (marketCap === null || marketCap < 0) {
    diagnostics.push(`FMP market-capitalization for ${providerSymbol} has no finite non-negative marketCap`);
  }

  const quoteRows = rows(await fetchStable('quote', { symbol: providerSymbol }));
  const marketPrice = finiteNumber(quoteRows[0]?.price);
  if (marketPrice === null || marketPrice < 0) {
    diagnostics.push(`FMP quote for ${providerSymbol} has no finite non-negative price`);
  }

  hydrated = {
    ...hydrated,
    valuation: {
      ...hydrated.valuation,
      ...(marketCap === null ? {} : {
        reportedMarketCap: {
          value: marketCap,
          currency: quoteCurrency,
          asOfDate: valuationDateUtc,
          provenance,
        },
      }),
      ...(marketPrice === null ? {} : {
        marketPrice: {
          value: marketPrice,
          currency: quoteCurrency,
          asOfDate: valuationDateUtc,
          provenance,
        },
      }),
    },
  };

  return {
    producer: hydrated,
    providerSymbol,
    usdPerCurrencyUnitByCurrency,
    diagnostics,
  };
}
