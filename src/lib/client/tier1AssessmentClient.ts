import type { Tier1PreRevenueAssessment } from '../tier1/preRevenue.ts';

type TierResponse = { ok?: boolean; assessment?: Tier1PreRevenueAssessment };
type CacheEntry = {
  expiresAt: number;
  promise: Promise<Tier1PreRevenueAssessment | null>;
};

const VERIFIED_CACHE_TTL_MS = 5 * 60_000;
const MAX_CONCURRENT_TIER_REQUESTS = 4;
const assessmentCache = new Map<string, CacheEntry>();
let activeTierRequests = 0;
const tierRequestQueue: Array<() => void> = [];

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

async function withTierRequestSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeTierRequests >= MAX_CONCURRENT_TIER_REQUESTS) {
    await new Promise<void>((resolve) => tierRequestQueue.push(resolve));
  }
  activeTierRequests += 1;
  try {
    return await run();
  } finally {
    activeTierRequests -= 1;
    tierRequestQueue.shift()?.();
  }
}

async function fetchTier1AssessmentOnce(key: string): Promise<Tier1PreRevenueAssessment | null> {
  return withTierRequestSlot(async () => {
    try {
      const response = await fetch(`/api/tier1-pre-revenue?symbol=${encodeURIComponent(key)}`);
      if (!response.ok) return null;
      const payload = await response.json() as TierResponse;
      return payload.ok === true && payload.assessment ? payload.assessment : null;
    } catch {
      return null;
    }
  });
}

export function fetchTier1Assessment(symbol: string): Promise<Tier1PreRevenueAssessment | null> {
  const key = normalizeSymbol(symbol);
  if (!key) return Promise.resolve(null);

  const now = Date.now();
  const cached = assessmentCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;
  if (cached) assessmentCache.delete(key);

  const promise = fetchTier1AssessmentOnce(key).then((assessment) => {
    const current = assessmentCache.get(key);
    if (current?.promise !== promise) return assessment;

    if (!assessment || assessment.status === 'NOT_VERIFIED') {
      // NOT_VERIFIED is deliberately non-sticky, but it no longer triggers an
      // immediate second full Tier calculation. A later consumer can retry.
      assessmentCache.delete(key);
    } else {
      current.expiresAt = Date.now() + VERIFIED_CACHE_TTL_MS;
    }
    return assessment;
  });

  assessmentCache.set(key, { expiresAt: now + VERIFIED_CACHE_TTL_MS, promise });
  return promise;
}

export function clearTier1AssessmentCacheForTests(): void {
  assessmentCache.clear();
  activeTierRequests = 0;
  tierRequestQueue.splice(0, tierRequestQueue.length);
}
