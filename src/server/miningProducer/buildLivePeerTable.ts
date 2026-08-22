import { fetchStableJson } from '../../../api/_fmp.js';
import { resolvePriceSeries } from '../../lib/prices/resolve.ts';
import { buildProducerPeerTable, type ProducerPeerTable } from '../../lib/miningProducer/peerTable.ts';
import type { ExplicitLongTermPriceDeck } from '../../lib/miningProducer/priceDeck.ts';
import type { ProducerJsonV1, ProducerRunContext } from '../../lib/miningProducer/types.ts';
import { resolveLiveProducerMarketInputs } from './resolveLiveMarketInputs.ts';

type StableFetch = (
  path: string,
  query?: Record<string, string | number | null | undefined>,
) => Promise<unknown>;

export type LiveProducerPeerTableResult = {
  table: ProducerPeerTable;
  hydratedProducers: ProducerJsonV1[];
  liveDiagnosticsByCompanyId: Record<string, string[]>;
  usdPerCurrencyUnitByCurrency: Record<string, number>;
};

function cachedStableFetch(base: StableFetch): StableFetch {
  const cache = new Map<string, Promise<unknown>>();
  return async (path, query = {}) => {
    const key = JSON.stringify({ path, query });
    let pending = cache.get(key);
    if (!pending) {
      pending = base(path, query);
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
    fetchStable?: StableFetch;
    resolvePriceSeriesFn?: typeof resolvePriceSeries;
    todayUtcFn?: () => string;
  } = {},
): Promise<LiveProducerPeerTableResult> {
  const baseStableFetch: StableFetch = deps.fetchStable ?? ((path, query) => fetchStableJson<unknown>(path, query));
  const fetchStable = cachedStableFetch(baseStableFetch);

  const live = await Promise.all(args.producers.map((producer) => resolveLiveProducerMarketInputs(producer, {
    fetchStable,
    todayUtcFn: deps.todayUtcFn,
  })));

  const usdPerCurrencyUnitByCurrency: Record<string, number> = {};
  const liveDiagnosticsByCompanyId: Record<string, string[]> = {};

  for (let index = 0; index < live.length; index += 1) {
    const companyId = args.producers[index].company.id;
    liveDiagnosticsByCompanyId[companyId] = live[index].diagnostics;
    for (const [currency, value] of Object.entries(live[index].usdPerCurrencyUnitByCurrency)) {
      const existing = usdPerCurrencyUnitByCurrency[currency];
      if (existing !== undefined && existing !== value) {
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
