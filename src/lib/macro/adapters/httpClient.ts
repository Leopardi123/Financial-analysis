const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
const hostState = new Map<string, { nextAllowedAt: number }>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJsonWithPolicies<T>(params: {
  url: string;
  init?: RequestInit;
  cacheTtlMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  minIntervalMs?: number;
}): Promise<T> {
  const cacheTtlMs = params.cacheTtlMs ?? 5 * 60_000;
  const maxRetries = params.maxRetries ?? 3;
  const baseDelayMs = params.baseDelayMs ?? 300;
  const minIntervalMs = params.minIntervalMs ?? 250;

  const cacheKey = `${params.url}::${JSON.stringify(params.init ?? {})}`;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const host = new URL(params.url).host;
  const state = hostState.get(host) ?? { nextAllowedAt: 0 };
  if (state.nextAllowedAt > now) {
    await sleep(state.nextAllowedAt - now);
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(params.url, {
        ...params.init,
        headers: {
          Accept: "application/json",
          ...(params.init?.headers ?? {}),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        if (retryable && attempt < maxRetries) {
          const backoff = baseDelayMs * (2 ** attempt);
          await sleep(backoff);
          continue;
        }
        throw new Error(`Request failed (${response.status}): ${body.slice(0, 300)}`);
      }

      const json = (await response.json()) as T;
      memoryCache.set(cacheKey, {
        expiresAt: Date.now() + cacheTtlMs,
        value: json,
      });
      hostState.set(host, { nextAllowedAt: Date.now() + minIntervalMs });
      return json;
    } catch (error) {
      lastError = error as Error;
      if (attempt >= maxRetries) break;
      const backoff = baseDelayMs * (2 ** attempt);
      await sleep(backoff);
    }
  }

  throw lastError ?? new Error(`Request failed for ${params.url}`);
}
