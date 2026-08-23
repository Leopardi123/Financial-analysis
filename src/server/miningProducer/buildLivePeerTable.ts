import { resolveFxUSDToTarget } from '../../lib/prices/fx/resolveFx.ts';
import { resolvePriceSeries } from '../../lib/prices/resolve.ts';
import { buildProducerPeerTable, type ProducerPeerTable } from '../../lib/miningProducer/peerTable.ts';
import type { ExplicitLongTermPriceDeck } from '../../lib/miningProducer/priceDeck.ts';
import type { ProducerJsonV1, ProducerRunContext } from '../../lib/miningProducer/types.ts';
import {
  fetchProducerQuoteFromCanonicalFmpPath,
  resolveLiveProducerMarketInputs,
  resolveProducerProviderSymbolFromCompanyMaster,
  type ProducerProviderSymbolResolution,
  type ProducerQuoteSnapshot,
} from './resolveLiveMarketInputs.ts';

export type LiveProducerPeerTableResult = {
  table: ProducerPeerTable;
  hydratedProducers: ProducerJsonV1[];
  liveDiagnosticsByCompanyId: Record<string, string[]>;
  usdPerCurrencyUnitByCurrency: Record<string, number>;
};

function cachedProviderSymbolResolver(
  base: (producer: ProducerJsonV1) => Promise<ProducerProviderSymbolResolution>,
): (producer: ProducerJsonV1) => Promise<ProducerProviderSymbolResolution> {
  const cache = new Map<string, Promise<ProducerProviderSymbolResolution>>();
  return async (producer) => {
    const key = `${producer.company.id}|${producer.company.primarySecurity?.ticker ?? ''}|${producer.company.primarySecurity?.exchange ?? ''}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = base(producer);
      cache.set(key, pending);
    }
    return pending;
  };
}

function cachedQuoteFetcher(
  base: (symbol: string) => Promise<ProducerQuoteSnapshot>,
): (symbol: string) => Promise<ProducerQuoteSnapshot> {
  const cache = new Map<string, Promise<ProducerQuoteSnapshot>>();
  return async (symbol) => {
    let pending = cache.get(symbol);
    if (!pending) {
      pending = base(symbol);
      cache.set(symbol, pending);
    }
    return pending;
  };
}

function cachedFxResolver(base: typeof resolveFxUSDToTarget): typeof resolveFxUSDToTarget {
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof resolveFxUSDToTarget>>>>();
  return async (args, deps) => {
    const key = JSON.stringify(args);
    let pending = cache.get(key);
    if (!pending) {
      pending = base(args, deps);
      cache.set(key, pending);
    }
    return pending;
  };
}

export async function buildLiveProducerPeerTable(
  args: {
    producers: readonly ProducerJsonV1[];
    context: ProducerRunContext;
    ltDeck?: ExplicitLongTermPriceDeck;
    reportedPriceDeckIdByCompanyId?: Readonly<Record<string, string>>;
    allowNonProductionReadySpotKeys?: boolean;
  },
  deps: {
    resolveProviderSymbolFn?: (producer: ProducerJsonV1) => Promise<ProducerProviderSymbolResolution>;
    fetchQuoteFn?: (symbol: string) => Promise<ProducerQuoteSnapshot>;
    resolveFxFn?: typeof resolveFxUSDToTarget;
    resolvePriceSeriesFn?: typeof resolvePriceSeries;
    todayUtcFn?: () => string;
  } = {},
): Promise<LiveProducerPeerTableResult> {
  const resolveProviderSymbolFn = cachedProviderSymbolResolver(
    deps.resolveProviderSymbolFn ?? resolveProducerProviderSymbolFromCompanyMaster,
  );
  const fetchQuoteFn = cachedQuoteFetcher(
    deps.fetchQuoteFn ?? fetchProducerQuoteFromCanonicalFmpPath,
  );
  const resolveFxFn = cachedFxResolver(deps.resolveFxFn ?? resolveFxUSDToTarget);

  const live = await Promise.all(args.producers.map((producer) => resolveLiveProducerMarketInputs(producer, {
    resolveProviderSymbolFn,
    fetchQuoteFn,
    resolveFxFn,
    todayUtcFn: deps.todayUtcFn,
  })));

  const usdPerCurrencyUnitByCurrency: Record<string, number> = {};
  const liveDiagnosticsByCompanyId: Record<string, string[]> = {};

  for (let index = 0; index < live.length; index += 1) {
    const companyId = args.producers[index].company.id;
    liveDiagnosticsByCompanyId[companyId] = live[index].diagnostics;
    for (const [currency, value] of Object.entries(live[index].usdPerCurrencyUnitByCurrency)) {
      const existing = usdPerCurrencyUnitByCurrency[currency];
      if (existing !== undefined && Math.abs(existing - value) > 1e-12) {
        throw new Error(`Live Producer peer run resolved conflicting ${currency}->USD FX values: ${existing} vs ${value}`);
      }
      usdPerCurrencyUnitByCurrency[currency] = value;
    }
  }

  const hydratedProducers = live.map((item) => item.producer);
  const table = await buildProducerPeerTable({
    producers: hydratedProducers,
    context: args.context,
    ltDeck: args.ltDeck,
    reportedPriceDeckIdByCompanyId: args.reportedPriceDeckIdByCompanyId,
    usdPerCurrencyUnitByCurrency,
    allowNonProductionReadySpotKeys: args.allowNonProductionReadySpotKeys,
  }, {
    resolvePriceSeriesFn: deps.resolvePriceSeriesFn,
  });

  for (const row of table.rows) {
    const liveDiagnostics = liveDiagnosticsByCompanyId[row.companyId] ?? [];
    row.diagnostics = [...new Set([...liveDiagnostics, ...row.diagnostics])];
  }

  return {
    table,
    hydratedProducers,
    liveDiagnosticsByCompanyId,
    usdPerCurrencyUnitByCurrency,
  };
}
