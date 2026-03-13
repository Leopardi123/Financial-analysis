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

function pickValueCodeByKeywords(variable: ScbVariable, keywordGroups: string[][]): string | null {
  const values = variable.values ?? [];
  const texts = variable.valueTexts ?? values;

  for (const group of keywordGroups) {
    const normalizedGroup = group.map(norm);
    const idx = values.findIndex((valueCode, i) => {
      const hay = norm(`${valueCode} ${texts[i] ?? ""}`);
      return normalizedGroup.every((kw) => hay.includes(kw));
    });
    if (idx >= 0) return values[idx] ?? null;
  }

  return null;
}

function buildDefaultSelection(variable: ScbVariable): string | null {
  const values = variable.values ?? [];
  const texts = variable.valueTexts ?? values;

  const preferredIndex = texts.findIndex((text) => {
    const t = norm(String(text));
    return t.includes("sweden") || t.includes("riket") || t.includes("hela landet");
  });
  if (preferredIndex >= 0) return values[preferredIndex] ?? null;

  return values[0] ?? null;
}

export async function fetchScbTableMetadata(path: string): Promise<ScbMetadata> {
  const url = `https://api.scb.se/OV0104/v1/doris/en/${path.replace(/^\/+/, "")}`;
  return fetchJsonWithPolicies<ScbMetadata>({ url });
}

export async function fetchScbSeriesByMetadata(params: {
  path: string;
  metricKeywordGroups: string[][];
}): Promise<Array<{ date: string; value: number | null }>> {
  const metadata = await fetchScbTableMetadata(params.path);
  const variables = metadata.variables ?? [];
  if (variables.length === 0) return [];

  const timeVar = variables.find((v) => String(v.code ?? "").toLowerCase() === "tid");
  const metricVar = variables.find((v) => {
    const code = norm(String(v.code ?? ""));
    const text = norm(String(v.text ?? ""));
    return code.includes("contents") || text.includes("contents") || text.includes("inneh");
  });
  if (!timeVar || !metricVar || !metricVar.code) return [];

  const pickedMetric = pickValueCodeByKeywords(metricVar, params.metricKeywordGroups);
  if (!pickedMetric) return [];

  const query = variables
    .map((variable) => {
      const code = String(variable.code ?? "");
      if (!code) return null;
      if (code.toLowerCase() === "tid") {
        return { code, selection: { filter: "all", values: ["*"] } };
      }
      if (code === metricVar.code) {
        return { code, selection: { filter: "item", values: [pickedMetric] } };
      }
      const selected = buildDefaultSelection(variable);
      if (!selected) return null;
      return { code, selection: { filter: "item", values: [selected] } };
    })
    .filter((item): item is { code: string; selection: { filter: string; values: string[] } } => item !== null);

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
