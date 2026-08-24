import { resolveFxUSDToTarget } from '../../lib/prices/fx/resolveFx.ts';
import type { ProducerJsonV1, Provenance, SourceRef } from '../../lib/miningProducer/types.ts';

type CompanyMasterCandidate = {
  symbol: string;
  name: string;
  exchange: string | null;
};

export type ProducerProviderSymbolResolution = {
  symbol: string | null;
  diagnostic?: string;
};

export type ProducerQuoteSnapshot = {
  price: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
};

type ResolveFx = typeof resolveFxUSDToTarget;

export type LiveProducerMarketInputs = {
  producer: ProducerJsonV1;
  providerSymbol: string | null;
  usdPerCurrencyUnitByCurrency: Record<string, number>;
  diagnostics: string[];
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalized(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function exchangeMatches(actual: string | null, expected: string | undefined): boolean {
  if (!expected) return true;
  return normalized(actual) === normalized(expected);
}

async function queryCompanyMaster(sql: string, args: Array<string | number>): Promise<Array<Record<string, unknown>>> {
  // Keep the root /api runtime module on the same .js import convention used by the
  // rest of Instrumentbrädan. This import is lazy so raw TypeScript unit tests can
  // inject dependencies without Node trying to resolve a non-built .js file.
  const { query } = await import('../../../api/_db.js');
  return await query(sql, args) as Array<Record<string, unknown>>;
}

export async function resolveProducerProviderSymbolFromCompanyMaster(
  producer: ProducerJsonV1,
): Promise<ProducerProviderSymbolResolution> {
  const security = producer.company.primarySecurity;
  if (!security) {
    return {
      symbol: null,
      diagnostic: 'Company-master resolution requires company.primarySecurity; ticker/exchange must not be inferred',
    };
  }

  const ticker = normalized(security.ticker);
  const rawCandidates = await queryCompanyMaster(
    `SELECT symbol, name, exchange
     FROM companies
     WHERE UPPER(symbol) = ?
        OR UPPER(symbol) LIKE ?`,
    [ticker, `${ticker}.%`],
  );
  const candidates: CompanyMasterCandidate[] = rawCandidates
    .map((row) => ({
      symbol: normalized(row?.symbol == null ? '' : String(row.symbol)),
      name: row?.name == null ? '' : String(row.name),
      exchange: row?.exchange == null ? null : String(row.exchange),
    }))
    .filter((candidate) => candidate.symbol.length > 0);

  const exchangeCandidates = candidates.filter((candidate) => exchangeMatches(candidate.exchange, security.exchange));
  const exactTicker = exchangeCandidates.filter((candidate) => normalized(candidate.symbol) === ticker);
  const resolved = exactTicker.length === 1
    ? exactTicker
    : exchangeCandidates.filter((candidate) => normalized(candidate.symbol).startsWith(`${ticker}.`));

  if (resolved.length === 1) {
    return { symbol: normalized(resolved[0].symbol) };
  }
  if (resolved.length > 1) {
    return {
      symbol: null,
      diagnostic: `Company-master security resolution ambiguous for ${security.ticker}/${security.exchange ?? 'unspecified'}: ${resolved.map((item) => item.symbol).join(', ')}`,
    };
  }

  return {
    symbol: null,
    diagnostic: `Company-master security resolution failed for ticker=${security.ticker}, exchange=${security.exchange ?? 'unspecified'}; no provider symbol is guessed`,
  };
}

export async function fetchProducerQuoteFromCanonicalFmpPath(symbol: string): Promise<ProducerQuoteSnapshot> {
  // Same canonical FMP v3 helper/path as the rest of Instrumentbrädan, loaded lazily
  // for compatibility with both Vercel's compiled runtime and raw-TS unit tests.
  const { fetchApiV3Json } = await import('../../../api/_fmp.js');
  const quote = await fetchApiV3Json<Array<Record<string, unknown>>>(`quote/${encodeURIComponent(symbol)}`);
  const first = Array.isArray(quote) ? quote[0] : null;
  return {
    price: finiteNumber(first?.price),
    marketCap: finiteNumber(first?.marketCap),
    sharesOutstanding: finiteNumber(first?.sharesOutstanding),
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
    resolveProviderSymbolFn?: (producer: ProducerJsonV1) => Promise<ProducerProviderSymbolResolution>;
    fetchQuoteFn?: (symbol: string) => Promise<ProducerQuoteSnapshot>;
    resolveFxFn?: ResolveFx;
    todayUtcFn?: () => string;
  } = {},
): Promise<LiveProducerMarketInputs> {
  const diagnostics: string[] = [];
  const todayUtc = (deps.todayUtcFn ?? (() => new Date().toISOString().slice(0, 10)))();
  const valuationDateUtc = producer.valuation.valuationDateUtc;

  if (valuationDateUtc !== todayUtc) {
    diagnostics.push(
      `Live market resolver refused: valuationDateUtc=${valuationDateUtc} differs from current UTC date ${todayUtc}; current market snapshot must not be used for a historical valuation date`,
    );
    return { producer, providerSymbol: null, usdPerCurrencyUnitByCurrency: {}, diagnostics };
  }

  const security = producer.company.primarySecurity;
  if (!security) {
    diagnostics.push('Live market resolver requires company.primarySecurity; ticker/exchange/currency must not be inferred');
    return { producer, providerSymbol: null, usdPerCurrencyUnitByCurrency: {}, diagnostics };
  }

  const resolveProviderSymbolFn = deps.resolveProviderSymbolFn ?? resolveProducerProviderSymbolFromCompanyMaster;
  let providerSymbol: string | null = null;
  try {
    const resolution = await resolveProviderSymbolFn(producer);
    providerSymbol = resolution.symbol;
    if (!providerSymbol) {
      diagnostics.push(resolution.diagnostic ?? 'Company-master security resolution failed');
    }
  } catch (error) {
    diagnostics.push(`Company-master security resolution failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const quoteCurrency = normalized(security.quoteCurrency);
  const usdPerCurrencyUnitByCurrency: Record<string, number> = {};
  if (quoteCurrency === 'USD') {
    usdPerCurrencyUnitByCurrency.USD = 1;
  } else {
    const resolveFxFn = deps.resolveFxFn ?? resolveFxUSDToTarget;
    try {
      const resolved = await resolveFxFn({
        targetCurrency: quoteCurrency,
        anchorDateUtc: valuationDateUtc,
        scenario: { mode: 'spot' },
        allowRefresh: true,
      });
      diagnostics.push(...resolved.warnings.map((warning) => `FX ${quoteCurrency}: ${warning}`));
      if (resolved.fx !== null && Number.isFinite(resolved.fx) && resolved.fx > 0) {
        usdPerCurrencyUnitByCurrency[quoteCurrency] = 1 / resolved.fx;
      } else {
        diagnostics.push(`FX ${quoteCurrency}->USD unresolved through canonical FX resolver; conversion is not guessed`);
      }
    } catch (error) {
      diagnostics.push(`FX ${quoteCurrency}->USD provider failure: ${error instanceof Error ? error.message : String(error)}; dependent USD metrics remain unresolved`);
    }
  }

  if (!providerSymbol) {
    return { producer, providerSymbol: null, usdPerCurrencyUnitByCurrency, diagnostics };
  }

  const sourceId = `fmp-v3-quote:${providerSymbol}:${valuationDateUtc}`;
  const provenance: Provenance = {
    sourceId,
    estimateClass: 'actual',
    confidence: 'high',
    confidenceReason: 'Provider symbol resolved from the existing company master; current price, market cap and shares use the same FMP v3 quote path already used elsewhere in Instrumentbrädan.',
  };
  const providerSource: SourceRef = {
    id: sourceId,
    sourceType: 'other',
    publisher: 'Financial Modeling Prep',
    title: `FMP v3 quote snapshot for ${providerSymbol}`,
    publishedDate: valuationDateUtc,
  };

  const fetchQuoteFn = deps.fetchQuoteFn ?? fetchProducerQuoteFromCanonicalFmpPath;
  let quote: ProducerQuoteSnapshot | null = null;
  try {
    quote = await fetchQuoteFn(providerSymbol);
  } catch (error) {
    diagnostics.push(
      `FMP v3 quote failed for ${providerSymbol}: ${error instanceof Error ? error.message : String(error)}; market fields remain unresolved without failing the peer table`,
    );
  }

  if (!quote) {
    return { producer, providerSymbol, usdPerCurrencyUnitByCurrency, diagnostics };
  }

  const marketCap = quote.marketCap !== null && quote.marketCap >= 0 ? quote.marketCap : null;
  const marketPrice = quote.price !== null && quote.price >= 0 ? quote.price : null;
  const sharesOutstanding = quote.sharesOutstanding !== null && quote.sharesOutstanding > 0
    ? quote.sharesOutstanding
    : null;

  if (marketCap === null) diagnostics.push(`FMP v3 quote for ${providerSymbol} has no finite non-negative marketCap`);
  if (marketPrice === null) diagnostics.push(`FMP v3 quote for ${providerSymbol} has no finite non-negative price`);
  if (sharesOutstanding === null) diagnostics.push(`FMP v3 quote for ${providerSymbol} has no finite positive sharesOutstanding`);

  let hydrated = appendSource(producer, providerSource);
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
      ...(sharesOutstanding === null ? {} : {
        sharesOutstanding: {
          value: sharesOutstanding,
          basis: 'basic_actual' as const,
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
