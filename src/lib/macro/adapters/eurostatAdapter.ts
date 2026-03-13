import { fetchJsonWithPolicies } from "./httpClient.ts";

type EurostatResponse = {
  value?: Record<string, number>;
  id?: string[];
  size?: number[];
  dimension?: Record<string, { category?: { index?: Record<string, number> } }>;
};

function toIsoDateFromPeriod(period: string): string | null {
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-28`;
  if (/^\d{4}M\d{2}$/.test(period)) return `${period.slice(0, 4)}-${period.slice(5, 7)}-28`;
  return null;
}

export async function fetchEurostatSeries(params: {
  dataset: string;
  filters: Record<string, string>;
}): Promise<Array<{ date: string; value: number | null }>> {
  const url = new URL(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${params.dataset}`);
  for (const [k, v] of Object.entries(params.filters)) {
    url.searchParams.set(k, v);
  }
  const payload = await fetchJsonWithPolicies<EurostatResponse>({ url: url.toString() });
  const timeIndex = payload.dimension?.time?.category?.index ?? {};
  const out = Object.entries(timeIndex)
    .map(([period, idx]) => {
      const date = toIsoDateFromPeriod(period);
      if (!date) return null;
      const value = payload.value?.[String(idx)] ?? null;
      return { date, value: typeof value === "number" ? value : null };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return out;
}
