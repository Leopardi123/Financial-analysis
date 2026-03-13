import { fetchJsonWithPolicies } from "./httpClient.ts";

type ScbDataRow = { key?: string[]; values?: string[] };

type ScbResponse = {
  data?: ScbDataRow[];
};

type ScbVariable = {
  code?: string;
  text?: string;
  values?: string[];
  valueTexts?: string[];
};

type ScbMetadata = {
  variables?: ScbVariable[];
};

export type ScbSeriesSelection = {
  dimensionCode: string;
  valueCode: string;
};

function parseScbTime(key: string): string | null {
  if (/^\d{4}M\d{2}$/.test(key)) return `${key.slice(0, 4)}-${key.slice(5, 7)}-28`;
  if (/^\d{4}$/.test(key)) return `${key}-12-28`;
  if (/^\d{4}K[1-4]$/.test(key)) {
    const month = String(Number(key.slice(5)) * 3).padStart(2, "0");
    return `${key.slice(0, 4)}-${month}-28`;
  }
  return null;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9åäö]+/gi, " ").trim();
}

function parseScbRows(payload: ScbResponse, timeIndex: number): Array<{ date: string; value: number | null }> {
  return (payload.data ?? [])
    .map((row) => {
      const keyValues = Array.isArray(row.key) ? row.key : [];
      const timeRaw = keyValues[timeIndex] ?? keyValues[keyValues.length - 1] ?? "";
      const date = parseScbTime(String(timeRaw));
      if (!date) return null;
      const raw = row.values?.[0] ?? "";
      const value = Number(String(raw).replace(",", "."));
      return { date, value: Number.isFinite(value) ? value : null };
    })
    .filter((row): row is { date: string; value: number | null } => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchScbTableMetadata(path: string): Promise<ScbMetadata> {
  const url = `https://api.scb.se/OV0104/v1/doris/en/${path.replace(/^\/+/, "")}`;
  return fetchJsonWithPolicies<ScbMetadata>({ url });
}

export async function fetchScbSeries(params: {
  path: string;
  query: unknown;
}): Promise<Array<{ date: string; value: number | null }>> {
  const metadata = await fetchScbTableMetadata(params.path);
  const variables = metadata.variables ?? [];
  const timeIndex = Math.max(0, variables.findIndex((v) => String(v.code ?? "").toLowerCase() === "tid"));

  const url = `https://api.scb.se/OV0104/v1/doris/en/${params.path.replace(/^\/+/, "")}`;
  const payload = await fetchJsonWithPolicies<ScbResponse>({
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params.query),
    },
  });

  return parseScbRows(payload, timeIndex);
}

export async function fetchScbSeriesByMetadata(params: {
  path: string;
  metricKeywords: string[];
}): Promise<Array<{ date: string; value: number | null }>> {
  const metadata = await fetchScbTableMetadata(params.path);
  const variables = metadata.variables ?? [];
  if (variables.length === 0) return [];

  const normalizedKeywords = params.metricKeywords.map(norm);
  const timeVar = variables.find((v) => String(v.code ?? "").toLowerCase() === "tid");
  const metricVar = variables.find((v) => {
    const code = norm(String(v.code ?? ""));
    const text = norm(String(v.text ?? ""));
    return code.includes("contents") || text.includes("contents") || text.includes("inneh");
  });
  if (!timeVar || !metricVar) return [];

  const metricValues = metricVar.values ?? [];
  const metricTexts = metricVar.valueTexts ?? metricValues;
  const pickedMetric = metricValues.find((valueCode, idx) => {
    const label = norm(`${valueCode} ${metricTexts[idx] ?? ""}`);
    return normalizedKeywords.every((kw) => label.includes(kw));
  });
  if (!pickedMetric) return [];

  const query = variables.map((variable) => {
    const code = String(variable.code ?? "");
    if (code.toLowerCase() === "tid") {
      return { code, selection: { filter: "all", values: ["*"] } };
    }
    if (code === metricVar.code) {
      return { code, selection: { filter: "item", values: [pickedMetric] } };
    }
    const first = variable.values?.[0];
    return { code, selection: { filter: "item", values: first ? [first] : [] } };
  });

  const url = `https://api.scb.se/OV0104/v1/doris/en/${params.path.replace(/^\/+/, "")}`;
  const payload = await fetchJsonWithPolicies<ScbResponse>({
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, response: { format: "json" } }),
    },
  });

  const timeIndex = variables.findIndex((v) => String(v.code ?? "").toLowerCase() === "tid");
  return parseScbRows(payload, timeIndex >= 0 ? timeIndex : variables.length - 1);
}
