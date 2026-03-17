import { fetchJsonWithPolicies } from "./httpClient.ts";

type StoxxRecord = { date?: unknown; close?: unknown; value?: unknown; price?: unknown; last?: unknown };

type StoxxPayload =
  | StoxxRecord[]
  | { data?: StoxxRecord[]; rows?: StoxxRecord[]; history?: StoxxRecord[]; results?: StoxxRecord[] };

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

function normalizeValue(record: StoxxRecord): number | null {
  const candidate = [record.close, record.value, record.price, record.last]
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .find((v) => Number.isFinite(v));
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}

function normalizePayload(payload: StoxxPayload): Array<{ date: string; value: number | null }> {
  const rows = Array.isArray(payload)
    ? payload
    : (payload.data ?? payload.rows ?? payload.history ?? payload.results ?? []);
  return rows
    .map((row) => {
      const date = normalizeDate(row.date);
      if (!date) return null;
      return { date, value: normalizeValue(row) };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchStoxxSeries(params: { symbol: string; from?: string; to?: string }): Promise<Array<{ date: string; value: number | null }>> {
  const baseUrl = process.env.STOXX_HISTORICAL_ENDPOINT;
  if (!baseUrl) return [];

  const url = new URL(baseUrl);
  url.searchParams.set("symbol", params.symbol);
  if (params.from) url.searchParams.set("from", params.from);
  if (params.to) url.searchParams.set("to", params.to);
  const token = process.env.STOXX_HISTORICAL_API_KEY;
  if (token) url.searchParams.set("api_key", token);

  try {
    const payload = await fetchJsonWithPolicies<StoxxPayload>({ url: url.toString() });
    return normalizePayload(payload);
  } catch {
    return [];
  }
}
