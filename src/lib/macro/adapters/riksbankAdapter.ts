import { fetchJsonWithPolicies } from "./httpClient.ts";

type RiksbankResponse = {
  observations?: Array<{ date?: string; value?: number | string }>;
};

type GenericObject = Record<string, unknown>;

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9åäö]+/gi, " ").trim();
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
      const payload = await fetchJsonWithPolicies<unknown>({ url });
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
    return includeTerms.every((term) => hay.includes(term));
  });

  return hit?.id ?? params.preferredIds?.[0] ?? null;
}

export async function fetchRiksbankSeries(seriesId: string): Promise<Array<{ date: string; value: number | null }>> {
  const url = `https://api.riksbank.se/swea/v1/Observations/${encodeURIComponent(seriesId)}`;
  const payload = await fetchJsonWithPolicies<RiksbankResponse>({ url });
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
