import { getLatestPriceCached } from './latestCache.js';
import { getPriceKeyDefinition, type PriceKey } from './keys.js';
import { fetchFredCommodityPriceSeries, getFredCommodityPriceMapping } from './providers/fred.js';
import { getProviderMapping, type ProviderMapping } from './registry/getPriceKeyMeta.js';
import { convertPriceToCanonical } from './units/convert.js';

export type CanonicalPriceProvider = 'FMP' | 'FRED';
export type CanonicalPriceType = 'market_quote' | 'monthly_period_average';

export type PriceProviderDescriptor = {
  provider: CanonicalPriceProvider;
  source_symbol: string;
  price_type: CanonicalPriceType;
};

export type LatestCanonicalPrice = PriceProviderDescriptor & {
  price: number | null;
  asof_utc: string | null;
  asof_period: string | null;
};

type LatestDeps = {
  getProviderMappingFn: typeof getProviderMapping;
  getLatestPriceCachedFn: typeof getLatestPriceCached;
  fetchFredCommodityPriceSeriesFn: typeof fetchFredCommodityPriceSeries;
};

function withDefaults(deps: Partial<LatestDeps>): LatestDeps {
  return {
    getProviderMappingFn: deps.getProviderMappingFn ?? getProviderMapping,
    getLatestPriceCachedFn: deps.getLatestPriceCachedFn ?? getLatestPriceCached,
    fetchFredCommodityPriceSeriesFn: deps.fetchFredCommodityPriceSeriesFn ?? fetchFredCommodityPriceSeries,
  };
}

function subtractUtcMonths(dateStr: string, months: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function normalizeProvider(mapping: ProviderMapping, priceKey: string): PriceProviderDescriptor {
  const provider = mapping.provider.trim().toUpperCase();
  if (provider === 'FMP') {
    return {
      provider: 'FMP',
      source_symbol: mapping.provider_symbol,
      price_type: 'market_quote',
    };
  }
  if (provider === 'FRED') {
    return {
      provider: 'FRED',
      source_symbol: mapping.provider_symbol,
      price_type: 'monthly_period_average',
    };
  }
  throw new Error(`Unsupported price provider for ${priceKey}: ${mapping.provider}`);
}

export async function getPriceProviderDescriptor(
  priceKey: PriceKey,
  deps: { getProviderMappingFn?: typeof getProviderMapping } = {},
): Promise<PriceProviderDescriptor> {
  const mapping = await (deps.getProviderMappingFn ?? getProviderMapping)(priceKey);
  return normalizeProvider(mapping, priceKey);
}

export async function getLatestCanonicalPrice(
  priceKey: PriceKey,
  args: { anchorDateUtc?: string } = {},
  deps: Partial<LatestDeps> = {},
): Promise<LatestCanonicalPrice> {
  const resolvedDeps = withDefaults(deps);
  const mapping = await resolvedDeps.getProviderMappingFn(priceKey);
  const descriptor = normalizeProvider(mapping, priceKey);
  const anchorDateUtc = args.anchorDateUtc ?? new Date().toISOString().slice(0, 10);

  if (descriptor.provider === 'FMP') {
    const latest = await resolvedDeps.getLatestPriceCachedFn(priceKey, mapping.provider_symbol);
    return {
      ...descriptor,
      price: latest.price,
      asof_utc: latest.asof_utc,
      asof_period: latest.asof_utc.slice(0, 7),
    };
  }

  const fredMapping = getFredCommodityPriceMapping(priceKey);
  if (!fredMapping) {
    throw new Error(`No verified FRED commodity mapping found for price key: ${priceKey}`);
  }
  if (mapping.provider_symbol !== fredMapping.fredSeriesId) {
    throw new Error(
      `FRED provider mapping mismatch for ${priceKey}: database=${mapping.provider_symbol}, registry=${fredMapping.fredSeriesId}`,
    );
  }

  const rows = await resolvedDeps.fetchFredCommodityPriceSeriesFn(
    fredMapping,
    { fromUtc: subtractUtcMonths(anchorDateUtc, 18), toUtc: anchorDateUtc },
  );
  const eligible = rows.filter((row) => row.dateUtc <= anchorDateUtc);
  const latest = eligible.length > 0 ? eligible[eligible.length - 1] : null;
  if (!latest) {
    return {
      ...descriptor,
      price: null,
      asof_utc: null,
      asof_period: null,
    };
  }

  const definition = getPriceKeyDefinition(priceKey);
  return {
    ...descriptor,
    price: convertPriceToCanonical({
      value: latest.close,
      fromUnit: fredMapping.providerUnit,
      canonicalUnit: definition.canonicalUnit,
    }),
    asof_utc: latest.dateUtc,
    asof_period: latest.sourcePeriod,
  };
}
