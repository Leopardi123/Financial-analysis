import type { PriceKey } from "./keys.js";
import { fetchQuote } from "./providers/fmp.js";

export interface LatestCacheEntry {
  price: number;
  asof_utc: string;
  expires_at: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const latestCache = new Map<PriceKey, LatestCacheEntry>();

type QuoteFetcher = (symbol: string) => Promise<{ price: number; asof?: string }>;

export async function getLatestPriceCached(
  priceKey: PriceKey,
  symbol: string,
  options: { ttlMs?: number; nowMs?: number; quoteFetcher?: QuoteFetcher } = {},
): Promise<{ price: number; asof_utc: string }> {
  const nowMs = options.nowMs ?? Date.now();
  const cached = latestCache.get(priceKey);
  if (cached && cached.expires_at > nowMs) {
    return { price: cached.price, asof_utc: cached.asof_utc };
  }

  const quote = await (options.quoteFetcher ?? fetchQuote)(symbol);
  const asof_utc = quote.asof ?? new Date(nowMs).toISOString();
  latestCache.set(priceKey, {
    price: quote.price,
    asof_utc,
    expires_at: nowMs + (options.ttlMs ?? DEFAULT_TTL_MS),
  });

  return { price: quote.price, asof_utc };
}

export function clearLatestCache(): void {
  latestCache.clear();
}
