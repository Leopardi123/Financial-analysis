import { fetchJsonWithPolicies } from "./httpClient.ts";

type EcbObs = { observations?: Array<{ period?: string; value?: number | string }> };

type EcbResponse = {
  data?: EcbObs[];
};

function normalizePeriod(period: string): string | null {
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-28`;
  if (/^\d{4}-Q\d$/.test(period)) {
    const q = Number(period.slice(-1));
    const month = String(q * 3).padStart(2, "0");
    return `${period.slice(0, 4)}-${month}-28`;
  }
  return null;
}

export async function fetchEcbSeries(seriesKey: string): Promise<Array<{ date: string; value: number | null }>> {
  const url = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?format=jsondata`;
  const payload = await fetchJsonWithPolicies<EcbResponse>({ url });
  const observations = payload.data?.[0]?.observations ?? [];
  return observations
    .map((obs) => {
      const date = typeof obs.period === "string" ? normalizePeriod(obs.period) : null;
      if (!date) return null;
      const n = typeof obs.value === "number" ? obs.value : Number(obs.value);
      return { date, value: Number.isFinite(n) ? n : null };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
