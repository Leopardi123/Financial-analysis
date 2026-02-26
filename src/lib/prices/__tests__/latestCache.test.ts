import { clearLatestCache, getLatestPriceCached } from "../latestCache.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

(async function runLatestCacheTests() {
  clearLatestCache();
  let calls = 0;
  const quoteFetcher = async () => {
    calls += 1;
    return { price: 123.45, asof: "2026-01-01T00:00:00.000Z" };
  };

  const first = await getLatestPriceCached("XAU_USD_TOZ", "GCUSD", { ttlMs: 600000, nowMs: 1000, quoteFetcher });
  const second = await getLatestPriceCached("XAU_USD_TOZ", "GCUSD", { ttlMs: 600000, nowMs: 2000, quoteFetcher });

  assert(first.price === 123.45, "First call should return fetched price");
  assert(second.price === 123.45, "Second call should return cached price");
  assert(calls === 1, `Expected fetcher called once, got ${calls}`);

  console.log("Latest cache tests passed");
})();
