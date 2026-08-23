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
      name: 'G Mining Ventures Corp.',
      primarySecurity: {
        ticker: 'GMIN',
        exchange: 'TSX',
        quoteCurrency: 'CAD',
        securityType: 'common',
      },
    },
    valuation: {
      valuationDateUtc: '2026-08-23',
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
    todayUtcFn: () => '2026-08-23',
    resolveProviderSymbolFn: async (producer) => {
      calls.push(`company-master:${producer.company.id}`);
      return { symbol: 'GMIN.TO' };
    },
    fetchQuoteFn: async (symbol) => {
      calls.push(`v3-quote:${symbol}`);
      return { price: 35, marketCap: 7_000_000_000, sharesOutstanding: 200_000_000 };
    },
    resolveFxFn: async (args) => {
      calls.push(`canonical-fx:${args.targetCurrency}`);
      return { fx: 1 / 0.73, warnings: [] };
    },
  });

  assertEqual(result.providerSymbol, 'GMIN.TO', 'security resolution uses existing company master result');
  assertClose(result.usdPerCurrencyUnitByCurrency.CAD, 0.73, 'CAD->USD is exact inverse of canonical USD->CAD resolver');
  assertEqual(result.producer.valuation.reportedMarketCap?.currency, 'CAD', 'v3 quote market cap preserves quote currency');
  assertClose(result.producer.valuation.reportedMarketCap?.value, 7_000_000_000, 'v3 quote market cap hydrated');
  assertClose(result.producer.valuation.marketPrice?.value, 35, 'v3 quote price hydrated');
  assertClose(result.producer.valuation.sharesOutstanding?.value, 200_000_000, 'v3 quote shares hydrated');
  assertEqual(result.producer.valuation.sharesOutstanding?.basis, 'basic_actual', 'v3 quote shares use current basic basis');
  assert(calls.includes('company-master:gmin-test'), 'company master is used instead of FMP symbol-search endpoint');
  assert(calls.includes('v3-quote:GMIN.TO'), 'existing FMP v3 quote path supplies market fields');
  assert(calls.includes('canonical-fx:CAD'), 'existing canonical FX resolver is reused');
  assertEqual(calls.length, 3, 'live market resolution requires no parallel Stable/FMP discovery calls');

  const marketValue = resolveProducerMarketValue({
    producer: result.producer,
    usdPerCurrencyUnitByCurrency: result.usdPerCurrencyUnitByCurrency,
  });
  assertClose(marketValue.marketCapUSD, 5_110_000_000, 'market cap converts with canonical FX');
  assertEqual(marketValue.enterpriseValueUSD, null, 'stale post-event balance blocks EV despite live market cap');
  assert(
    marketValue.diagnostics.some((item) => item.includes('stale after material event')),
    'stale balance produces explicit EV diagnostic',
  );

  const unverifiedFx = await resolveLiveProducerMarketInputs({
    ...baseProducer(),
    company: {
      ...baseProducer().company,
      primarySecurity: { ticker: 'TEST', exchange: 'X', quoteCurrency: 'XYZ', securityType: 'common' },
    },
  }, {
    todayUtcFn: () => '2026-08-23',
    resolveProviderSymbolFn: async () => ({ symbol: 'TEST.X' }),
    fetchQuoteFn: async () => ({ price: 10, marketCap: 100, sharesOutstanding: 10 }),
    resolveFxFn: async () => ({ fx: null, warnings: ['Unknown legacy priceKey mapping: USD_XYZ'] }),
  });
  assertEqual(unverifiedFx.usdPerCurrencyUnitByCurrency.XYZ, undefined, 'missing canonical FX mapping remains unresolved');
  assert(
    unverifiedFx.diagnostics.some((item) => item.includes('not guessed')),
    'missing FX states explicit no-guess diagnostic',
  );

  const quoteFailure = await resolveLiveProducerMarketInputs(baseProducer(), {
    todayUtcFn: () => '2026-08-23',
    resolveProviderSymbolFn: async () => ({ symbol: 'GMIN.TO' }),
    resolveFxFn: async () => ({ fx: 1 / 0.73, warnings: [] }),
    fetchQuoteFn: async () => {
      throw new Error('provider unavailable');
    },
  });
  assertEqual(quoteFailure.providerSymbol, 'GMIN.TO', 'resolved provider symbol survives quote failure');
  assertEqual(quoteFailure.producer.valuation.reportedMarketCap, undefined, 'quote failure does not synthesize market cap');
  assert(
    quoteFailure.diagnostics.some((item) => item.includes('without failing the peer table')),
    'quote provider failure is fail-soft',
  );

  const fxFailure = await resolveLiveProducerMarketInputs(baseProducer(), {
    todayUtcFn: () => '2026-08-23',
    resolveProviderSymbolFn: async () => ({ symbol: 'GMIN.TO' }),
    fetchQuoteFn: async () => ({ price: 35, marketCap: 7_000_000_000, sharesOutstanding: 200_000_000 }),
    resolveFxFn: async () => {
      throw new Error('FX endpoint unavailable');
    },
  });
  assertEqual(fxFailure.producer.valuation.reportedMarketCap?.value, 7_000_000_000, 'FX failure does not discard valid local-currency market cap');
  assertEqual(fxFailure.usdPerCurrencyUnitByCurrency.CAD, undefined, 'FX failure leaves USD conversion unresolved');
  assert(
    fxFailure.diagnostics.some((item) => item.includes('dependent USD metrics remain unresolved')),
    'FX provider failure is fail-soft',
  );

  const historicalRefusal = await resolveLiveProducerMarketInputs(baseProducer(), {
    todayUtcFn: () => '2026-08-24',
    resolveProviderSymbolFn: async () => {
      throw new Error('Historical-date refusal must happen before company-master resolution');
    },
    fetchQuoteFn: async () => {
      throw new Error('Historical-date refusal must happen before quote');
    },
    resolveFxFn: async () => {
      throw new Error('Historical-date refusal must happen before FX');
    },
  });
  assertEqual(historicalRefusal.providerSymbol, null, 'current snapshot is not used for historical valuation date');
  assert(historicalRefusal.diagnostics.some((item) => item.includes('must not be used')), 'historical-date refusal diagnostic');

  console.log('Mining Producer live market/FX tests passed');
}

void run();
