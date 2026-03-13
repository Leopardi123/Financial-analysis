import { fetchJsonWithPolicies } from "./httpClient.ts";

type ScbResponse = {
  data?: Array<{ key?: string[]; values?: string[] }>;
};

function parseScbTime(key: string): string | null {
  if (/^\d{4}M\d{2}$/.test(key)) return `${key.slice(0, 4)}-${key.slice(5, 7)}-28`;
  if (/^\d{4}$/.test(key)) return `${key}-12-28`;
  return null;
}

export async function fetchScbSeries(params: {
  path: string;
  query: unknown;
}): Promise<Array<{ date: string; value: number | null }>> {
  const url = `https://api.scb.se/OV0104/v1/doris/en/${params.path.replace(/^\/+/, "")}`;
  const payload = await fetchJsonWithPolicies<ScbResponse>({
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.query),
    },
  });

  return (payload.data ?? [])
    .map((row) => {
      const t = row.key?.[row.key.length - 1] ?? "";
      const date = parseScbTime(String(t));
      if (!date) return null;
      const raw = row.values?.[0] ?? "";
      const value = Number(String(raw).replace(",", "."));
      return { date, value: Number.isFinite(value) ? value : null };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
