import { fetchJsonWithPolicies } from "./httpClient.ts";

type ScbDataRow = { key?: string[]; values?: string[] };

type ScbResponse = {
  data?: ScbDataRow[];
  columns?: Array<{ code?: string }>;
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

type ScbDirectoryEntry = string | { id?: string; text?: string };

type PxSelector = {
  codeHint: string;
  preferredValueCodes?: string[];
  valueKeywordGroups?: string[][];
};

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9åäö.]+/gi, " ").trim();
}

function parseScbTime(key: string): string | null {
  if (/^\d{4}M\d{2}$/.test(key)) return `${key.slice(0, 4)}-${key.slice(5, 7)}-28`;
  if (/^\d{4}$/.test(key)) return `${key}-12-28`;
  if (/^\d{4}K[1-4]$/.test(key)) {
    const month = String(Number(key.slice(5)) * 3).padStart(2, "0");
    return `${key.slice(0, 4)}-${month}-28`;
  }
  return null;
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

function resolveVariableByHint(variables: ScbVariable[], codeHint: string): ScbVariable | null {
  const hint = norm(codeHint);
  return variables.find((v) => {
    const code = norm(String(v.code ?? ""));
    const text = norm(String(v.text ?? ""));
    return code === hint || text.includes(hint) || code.includes(hint);
  }) ?? null;
}

function resolveValueCode(variable: ScbVariable, selector: PxSelector): string | null {
  const values = variable.values ?? [];
  const valueTexts = variable.valueTexts ?? values;

  for (const code of selector.preferredValueCodes ?? []) {
    const hit = values.find((v) => String(v).toLowerCase() === String(code).toLowerCase());
    if (hit) return hit;
  }

  for (const group of selector.valueKeywordGroups ?? []) {
    const keywords = group.map(norm);
    const idx = values.findIndex((valueCode, i) => {
      const hay = norm(`${valueCode} ${valueTexts[i] ?? ""}`);
      return keywords.every((kw) => hay.includes(kw));
    });
    if (idx >= 0) return values[idx] ?? null;
  }

  return null;
}

function defaultSelection(variable: ScbVariable): string | null {
  const values = variable.values ?? [];
  const valueTexts = variable.valueTexts ?? values;
  const idx = values.findIndex((v, i) => {
    const hay = norm(`${v} ${valueTexts[i] ?? ""}`);
    return hay.includes("sweden") || hay.includes("riket") || hay.includes("hela landet") || hay.includes("total");
  });
  if (idx >= 0) return values[idx] ?? null;
  return values[0] ?? null;
}

export async function fetchScbTableMetadata(path: string): Promise<ScbMetadata> {
  const normalizedPath = path.replace(/^\/+/, "").replace(/^ssd\//i, "");
  const url = `https://api.scb.se/OV0104/v1/doris/en/ssd/${normalizedPath}`;
  return fetchJsonWithPolicies<ScbMetadata>({ url });
}

export async function listScbDirectory(path: string): Promise<string[]> {
  const normalizedPath = path.replace(/^\/+/, "").replace(/^ssd\//i, "");
  const url = `https://api.scb.se/OV0104/v1/doris/en/ssd/${normalizedPath}`;
  const payload = await fetchJsonWithPolicies<ScbDirectoryEntry[]>({ url });
  return (Array.isArray(payload) ? payload : [])
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (typeof entry === "object" && entry !== null) {
        return String(entry.id ?? entry.text ?? "").trim();
      }
      return "";
    })
    .filter((entry) => entry.length > 0);
}

export async function discoverScbTablePath(params: {
  directoryPath: string;
  mustIncludeKeywords: string[];
}): Promise<string | null> {
  const entries = await listScbDirectory(params.directoryPath);
  const keywords = params.mustIncludeKeywords.map(norm);
  const match = entries.find((entry) => {
    const hay = norm(entry);
    return keywords.every((keyword) => hay.includes(keyword));
  });
  if (!match) return null;
  const dir = params.directoryPath.replace(/^\/+/, "").replace(/^ssd\//i, "").replace(/\/$/, "");
  return `${dir}/${match}`;
}

export async function queryScbTable(path: string, queryBody: Record<string, unknown>): Promise<ScbResponse> {
  const normalizedPath = path.replace(/^\/+/, "").replace(/^ssd\//i, "");
  const url = `https://api.scb.se/OV0104/v1/doris/en/ssd/${normalizedPath}`;
  return fetchJsonWithPolicies<ScbResponse>({
    url,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queryBody),
    },
    minIntervalMs: 1_100,
  });
}

export function parsePxWebResponse(payload: ScbResponse, timeIndex: number): Array<{ date: string; value: number | null }> {
  return parseScbRows(payload, timeIndex);
}

export async function fetchScbPxTableSeries(params: {
  path: string;
  selectors: PxSelector[];
}): Promise<Array<{ date: string; value: number | null }>> {
  const metadata = await fetchScbTableMetadata(params.path);
  const variables = metadata.variables ?? [];
  if (variables.length === 0) return [];

  const timeVar = resolveVariableByHint(variables, "Tid");
  if (!timeVar || !timeVar.code) return [];

  const selectorByCode = new Map<string, string>();
  for (const selector of params.selectors) {
    const variable = resolveVariableByHint(variables, selector.codeHint);
    if (!variable || !variable.code) continue;
    const selectedValue = resolveValueCode(variable, selector);
    if (selectedValue) selectorByCode.set(variable.code, selectedValue);
  }

  const query = variables
    .map((variable) => {
      const code = String(variable.code ?? "");
      if (!code) return null;
      if (code === timeVar.code) {
        return { code, selection: { filter: "all", values: ["*"] } };
      }
      const selected = selectorByCode.get(code) ?? defaultSelection(variable);
      if (!selected) return null;
      return { code, selection: { filter: "item", values: [selected] } };
    })
    .filter((row): row is { code: string; selection: { filter: string; values: string[] } } => row !== null);

  const payload = await queryScbTable(params.path, { query, response: { format: "json-stat2" } });

  const timeIndex = variables.findIndex((v) => String(v.code ?? "") === timeVar.code);
  return parsePxWebResponse(payload, timeIndex >= 0 ? timeIndex : variables.length - 1);
}

export async function fetchScbSeriesByMetadata(params: {
  path: string;
  metricKeywordGroups: string[][];
}): Promise<Array<{ date: string; value: number | null }>> {
  return fetchScbPxTableSeries({
    path: params.path,
    selectors: [
      {
        codeHint: "ContentsCode",
        valueKeywordGroups: params.metricKeywordGroups,
      },
    ],
  });
}
