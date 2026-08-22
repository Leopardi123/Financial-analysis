import { resolveLiveProducerMarketInputs } from '../../../server/miningProducer/resolveLiveMarketInputs.ts';
import { resolveProducerMarketValue } from '../marketValue.ts';
import type { ProducerJsonV1, Provenance } from '../types.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
}

function assertClose(actual: number | null | undefined, expected: number, message: string, tolerance = 1e-9): void {
  if (actual === null || actual === undefined || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}. Expected ${expected}, received ${String(actual)}`);
  }
}

const provenance: Provenance = { sourceId: 's1', estimateClass: 'actual' };

function baseProducer(): ProducerJsonV1 {
  return {
    version: 'producer_json_v1',
    company: {
      id: 'gmin-test',
      name: 'GMIN Test',
      primarySecurity: {
        ticker: 'GMIN',
        exchange: 'TSX',
        quoteCurrency: 'CAD',
        securityType: 'common',
      },
    },
    valuation: {
      valuationDateUtc: '2026-08-22',
      balanceSheet: {
        asOfDate: '2026-06-30',
        usability: 'stale_after_material_event',
        usabilityReason: 'Test acquisition closed after balance date',
        cashAndEquivalents: { value: 200_000_000, currency: 'USD', asOfDate: '2026-06-30', provenance },
        totalDebt: { value: 30_000_000, currency: 'USD', asOfDate: '2026-06-30', provenance },
      },
    },
    projects: [],
    sources: [{ id: 's1', sourceType: 'financial_statement', publisher: 'Issuer', title: 'Test balance' }],
  };
}

async function run(): Promise<void> {
  const calls: string[] = [];
  const result = await resolveLiveProducerMarketInputs(baseProducer(), {
    todayUtcFn: () => '2026-08-22',
    fetchStable: async (path, query) => {
      calls.push(`${path}:${String(query?.query ?? query?.symbol ?? '')}`);
      if (path === 'search-symbol') {
        return [
          { symbol: 'GMIN.TO', currency: 'CAD', exchangeShortName: 'TSX' },
          { symbol: 'GMINF', currency: 'USD', exchangeShortName: 'OTCQX' },
        ];
      }
      if (path === 'forex-list') return [{ symbol: 'CADUSD' }, { symbol: 'USDBRL' }];
      if (path === 'market-capitalization') return [{ symbol: 'GMIN.TO', marketCap: 7_000_000_000 }];
      if (path === 'quote' && query?.symbol === 'CADUSD') return [{ symbol: 'CADUSD', price: 0.73 }];
      if (path === 'quote' && query?.symbol === 'GMIN.TO') return [{ symbol: 'GMIN.TO', price: 35 }];
      throw new Error(`Unexpected fake FMP call ${path}`);
    },
  });

  assertEqual(result.providerSymbol, 'GMIN.TO', 'security resolution uses declared ticker/exchange/currency');
  assertClose(result.usdPerCurrencyUnitByCurrency.CAD, 0.73, 'CAD->USD uses verified direct forex-list pair');
  assertEqual(result.producer.valuation.reportedMarketCap?.currency, 'CAD', 'provider market cap preserves quote currency');
  assertClose(result.producer.valuation.reportedMarketCap?.value, 7_000_000_000, 'provider market cap hydrated');
  assertClose(result.producer.valuation.marketPrice?.value, 35, 'provider price hydrated');
  assert(calls.includes('forex-list:'), 'forex-list is queried before using FX symbol');
  assert(calls.includes('quote:CADUSD'), 'only verified forex-list pair is quoted');

  const marketValue = resolveProducerMarketValue({
    producer: result.producer,
    usdPerCurrencyUnitByCurrency: result.usdPerCurrencyUnitByCurrency,
  });
  assertClose(marketValue.marketCapUSD, 5_110_000_000, 'market cap converts with explicit provider FX');
  assertEqual(marketValue.enterpriseValueUSD, null, 'stale post-event balance blocks EV despite live market cap');
  assert(
    marketValue.diagnostics.some((item) => item.includes('stale after material event')),
    'stale balance produces explicit EV diagnostic',
  );

  const inverse = await resolveLiveProducerMarketInputs({
    ...baseProducer(),
    company: {
      ...baseProducer().company,
      primarySecurity: { ticker: 'TEST', exchange: 'B3', quoteCurrency: 'BRL', securityType: 'common' },
    },
  }, {
    todayUtcFn: () => '2026-08-22',
    fetchStable: async (path, query) => {
      if (path === 'search-symbol') return [{ symbol: 'TEST.SA', currency: 'BRL', exchangeShortName: 'B3' }];
      if (path === 'forex-list') return [{ symbol: 'USDBRL' }];
      if (path === 'quote' && query?.symbol === 'USDBRL') return [{ price: 5 }];
      if (path === 'market-capitalization') return [{ marketCap: 100 }];
      if (path === 'quote' && query?.symbol === 'TEST.SA') return [{ price: 10 }];
      throw new Error(`Unexpected fake FMP call ${path}`);
    },
  });
  assertClose(inverse.usdPerCurrencyUnitByCurrency.BRL, 0.2, 'verified inverse USD/BRL pair is inverted');

  const unverifiedFx = await resolveLiveProducerMarketInputs({
    ...baseProducer(),
    company: {
      ...baseProducer().company,
      primarySecurity: { ticker: 'TEST', exchange: 'X', quoteCurrency: 'XYZ', securityType: 'common' },
    },
  }, {
    todayUtcFn: () => '2026-08-22',
    fetchStable: async (path) => {
      if (path === 'search-symbol') return [{ symbol: 'TEST.X', currency: 'XYZ', exchangeShortName: 'X' }];
      if (path === 'forex-list') return [{ symbol: 'EURUSD' }];
      if (path === 'market-capitalization') return [{ marketCap: 100 }];
      if (path === 'quote') return [{ price: 10 }];
      throw new Error(`Unexpected fake FMP call ${path}`);
    },
  });
  assertEqual(unverifiedFx.usdPerCurrencyUnitByCurrency.XYZ, undefined, 'missing FX pair remains unresolved');
  assert(
    unverifiedFx.diagnostics.some((item) => item.includes('must not be guessed')),
    'missing FX pair states no-guess diagnostic',
  );

  const historicalRefusal = await resolveLiveProducerMarketInputs(baseProducer(), {
    todayUtcFn: () => '2026-08-23',
    fetchStable: async () => {
      throw new Error('Historical-date refusal must happen before any provider call');
    },
  });
  assertEqual(historicalRefusal.providerSymbol, null, 'current snapshot is not used for historical valuation date');
  assert(historicalRefusal.diagnostics.some((item) => item.includes('must not be used')), 'historical-date refusal diagnostic');

  console.log('Mining Producer live market/FX tests passed');
}

void run();
