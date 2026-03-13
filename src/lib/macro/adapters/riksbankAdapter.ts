import { fetchJsonWithPolicies } from "./httpClient.ts";

type RiksbankResponse = {
  observations?: Array<{ date?: string; value?: number | string }>;
};

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
