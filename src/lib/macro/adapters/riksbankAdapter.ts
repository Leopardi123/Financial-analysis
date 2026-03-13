type RiksbankResponse = {
  observations?: Array<{ date?: string; value?: number | string }>;
};

type GenericObject = Record<string, unknown>;

type CacheEntry = { expiresAt: number; value: unknown };

const riksbankCache = new Map<string, CacheEntry>();
let riksbankQueue: Promise<unknown> = Promise.resolve();
const riksbankRequestTimestamps: number[] = [];

const RIKSBANK_MAX_REQUESTS_PER_MINUTE = 5;
const RIKSBANK_WINDOW_MS = 60_000;
const RIKSBANK_429_BACKOFF_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9åäö]+/gi, " ").trim();
}

async function withRiksbankQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = async () => {
    while (true) {
      const now = Date.now();
      while (riksbankRequestTimestamps.length > 0 && now - riksbankRequestTimestamps[0] >= RIKSBANK_WINDOW_MS) {
        riksbankRequestTimestamps.shift();
      }

      if (riksbankRequestTimestamps.length < RIKSBANK_MAX_REQUESTS_PER_MINUTE) {
        riksbankRequestTimestamps.push(Date.now());
        return task();
      }

      const earliest = riksbankRequestTimestamps[0] ?? now;
      const waitMs = Math.max(10, RIKSBANK_WINDOW_MS - (now - earliest));
      await sleep(waitMs);
    }
  };

  const next = riksbankQueue.then(run, run);
  riksbankQueue = next.then(() => undefined, () => undefined);
  return next;
}

async function fetchRiksbankJson<T>(url: string, cacheTtlMs = 300_000): Promise<T> {
  const cached = riksbankCache.get(url);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const execute = async (): Promise<T> => {
    let attempted429 = false;

    while (true) {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (response.status === 429) {
        if (attempted429) {
          throw new Error(`Riksbank request failed (429): ${url}`);
        }
        attempted429 = true;
        await sleep(RIKSBANK_429_BACKOFF_MS);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Riksbank request failed (${response.status}): ${body.slice(0, 200)}`);
      }

      const json = (await response.json()) as T;
      riksbankCache.set(url, { expiresAt: Date.now() + cacheTtlMs, value: json });
      return json;
    }
  };

  return withRiksbankQueue(execute);
}

function parseSeriesCatalog(payload: unknown): Array<{ id: string; title: string }> {
  const rows: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as GenericObject)?.series)
      ? ((payload as GenericObject).series as unknown[])
      : Array.isArray((payload as GenericObject)?.data)
        ? ((payload as GenericObject).data as unknown[])
        : [];

  return rows
    .map((row) => {
      if (typeof row !== "object" || row === null) return null;
      const obj = row as GenericObject;
      const id = String(obj.seriesId ?? obj.id ?? obj.code ?? "").trim();
      const title = String(obj.seriesName ?? obj.name ?? obj.title ?? obj.description ?? "").trim();
      if (!id) return null;
      return { id, title };
    })
    .filter((row): row is { id: string; title: string } => row !== null);
}

export async function fetchRiksbankSeriesCatalog(): Promise<Array<{ id: string; title: string }>> {
  const urls = [
    "https://api.riksbank.se/swea/v1/series",
    "https://api.riksbank.se/swea/v1/Series",
    "https://api.riksbank.se/swea/v1/variables",
  ];

  for (const url of urls) {
    try {
      const payload = await fetchRiksbankJson<unknown>(url, 15 * 60_000);
      const parsed = parseSeriesCatalog(payload);
      if (parsed.length > 0) return parsed;
    } catch {
      // try next metadata endpoint
    }
  }
  return [];
}

export async function resolveRiksbankSeriesIdByMetadata(params: {
  includeTerms: string[];
  includeAnyGroups?: string[][];
  preferredIds?: string[];
}): Promise<string | null> {
  const includeTerms = params.includeTerms.map(norm);
  const catalog = await fetchRiksbankSeriesCatalog();
  if (catalog.length === 0) {
    return params.preferredIds?.[0] ?? null;
  }

  const byExactPreferred = (params.preferredIds ?? []).find((preferred) => catalog.some((entry) => entry.id === preferred));
  if (byExactPreferred) return byExactPreferred;

  const hit = catalog.find((entry) => {
    const hay = norm(`${entry.id} ${entry.title}`);
    const strictHit = includeTerms.length > 0 && includeTerms.every((term) => hay.includes(term));
    if (strictHit) return true;
    const groups = params.includeAnyGroups ?? [];
    return groups.some((group) => group.map(norm).every((term) => hay.includes(term)));
  });

  return hit?.id ?? params.preferredIds?.[0] ?? null;
}

export async function fetchRiksbankSeries(seriesId: string): Promise<Array<{ date: string; value: number | null }>> {
  const url = `https://api.riksbank.se/swea/v1/Observations/${encodeURIComponent(seriesId)}`;
  const payload = await fetchRiksbankJson<RiksbankResponse>(url, 5 * 60_000);
  return (payload.observations ?? [])
    .map((obs) => {
      const date = typeof obs.date === "string" ? obs.date.slice(0, 10) : null;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const value = typeof obs.value === "number" ? obs.value : Number(obs.value);
      return { date, value: Number.isFinite(value) ? value : null };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
