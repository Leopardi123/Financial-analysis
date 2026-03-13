import { fetchJsonWithPolicies } from "./httpClient.ts";

type EcbJsonDataResponse = {
  data?: Array<{
    observations?: Array<{ period?: string; value?: number | string }>;
  }>;
};

type EcbSdmxJsonResponse = {
  dataSets?: Array<{ series?: Record<string, { observations?: Record<string, [number | null]> }> }>;
  structure?: {
    dimensions?: {
      observation?: Array<{ values?: Array<{ id?: string }> }>;
    };
  };
};

function normalizePeriod(period: string): string | null {
  if (/^\d{4}-\d{2}$/.test(period)) return `${period}-28`;
  if (/^\d{4}M\d{2}$/.test(period)) return `${period.slice(0, 4)}-${period.slice(5, 7)}-28`;
  if (/^\d{4}-Q\d$/.test(period)) {
    const q = Number(period.slice(-1));
    const month = String(q * 3).padStart(2, "0");
    return `${period.slice(0, 4)}-${month}-28`;
  }
  return null;
}

function parseJsonData(payload: EcbJsonDataResponse): Array<{ date: string; value: number | null }> {
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

function parseSdmxJson(payload: EcbSdmxJsonResponse): Array<{ date: string; value: number | null }> {
  const periods = payload.structure?.dimensions?.observation?.[0]?.values?.map((v) => String(v.id ?? "")).filter(Boolean) ?? [];
  const seriesMap = payload.dataSets?.[0]?.series ?? {};
  const firstSeries = Object.values(seriesMap)[0];
  const observations = firstSeries?.observations ?? {};
  return Object.entries(observations)
    .map(([idx, arr]) => {
      const period = periods[Number(idx)] ?? "";
      const date = normalizePeriod(period);
      if (!date) return null;
      const raw = Array.isArray(arr) ? arr[0] : null;
      const n = typeof raw === "number" ? raw : Number(raw);
      return { date, value: Number.isFinite(n) ? n : null };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchEcbSeries(params: { flowRef: string; key: string }): Promise<Array<{ date: string; value: number | null }>> {
  const base = `https://data-api.ecb.europa.eu/service/data/${params.flowRef}/${params.key}`;
  const jsonDataUrl = `${base}?format=jsondata`;
  const sdmxJsonUrl = `${base}?format=sdmx-json`;

  try {
    const payload = await fetchJsonWithPolicies<EcbJsonDataResponse>({ url: jsonDataUrl });
    const parsed = parseJsonData(payload);
    if (parsed.length > 0) return parsed;
  } catch {
    // try fallback parser format
  }

  const payload = await fetchJsonWithPolicies<EcbSdmxJsonResponse>({ url: sdmxJsonUrl });
  return parseSdmxJson(payload);
}
