import type { Tier1PreRevenueAssessment } from '../tier1/preRevenue.ts';

type TierResponse = { ok?: boolean; assessment?: Tier1PreRevenueAssessment };
type CacheEntry = {
  expiresAt: number;
  promise: Promise<Tier1PreRevenueAssessment | null>;
};

const VERIFIED_CACHE_TTL_MS = 30_000;
const TRANSIENT_RETRY_DELAY_MS = 250;
const assessmentCache = new Map<string, CacheEntry>();

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTier1AssessmentOnce(key: string): Promise<Tier1PreRevenueAssessment | null> {
  try {
    const response = await fetch(`/api/tier1-pre-revenue?symbol=${encodeURIComponent(key)}`);
    if (!response.ok) return null;
    const payload = await response.json() as TierResponse;
    return payload.ok === true && payload.assessment ? payload.assessment : null;
  } catch {
    return null;
  }
}

async function fetchTier1AssessmentWithRetry(key: string): Promise<Tier1PreRevenueAssessment | null> {
  const first = await fetchTier1AssessmentOnce(key);
  if (first && first.status !== 'NOT_VERIFIED') return first;

  await sleep(TRANSIENT_RETRY_DELAY_MS);
  return fetchTier1AssessmentOnce(key);
}

export function fetchTier1Assessment(symbol: string): Promise<Tier1PreRevenueAssessment | null> {
  const key = normalizeSymbol(symbol);
  if (!key) return Promise.resolve(null);

  const now = Date.now();
  const cached = assessmentCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;
  if (cached) assessmentCache.delete(key);

  const promise = fetchTier1AssessmentWithRetry(key).then((assessment) => {
    const current = assessmentCache.get(key);
    if (current?.promise !== promise) return assessment;

    if (!assessment || assessment.status === 'NOT_VERIFIED') {
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
}
