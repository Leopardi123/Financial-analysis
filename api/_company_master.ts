import { batch, execute, query } from "./_db.js";

const STABLE_URL = "https://financialmodelingprep.com/stable/stock-list";
const LEGACY_URL = "https://financialmodelingprep.com/api/v3/stock/list";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const SUFFIX_TOKENS = new Set([
  "inc", "corp", "corporation", "ltd", "limited", "plc", "sa", "ag", "ab", "asa", "nv", "oyj", "spa", "sarl", "llc", "co", "company",
]);

type RawCompany = Record<string, unknown>;

export type CompanyMasterRow = {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
  normalized_name: string;
};

export function normalizeName(name: string): string {
  let normalized = name.toLowerCase().trim();
  normalized = normalized.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  let tokens = normalized.split(" ").filter(Boolean);
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    if (!SUFFIX_TOKENS.has(last)) {
      break;
    }
    tokens = tokens.slice(0, -1);
  }

  return tokens.join(" ").trim();
}

function toCompanyRow(row: RawCompany): CompanyMasterRow | null {
  const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const exchangeCandidate =
    typeof row.exchange === "string"
      ? row.exchange
      : typeof row.exchangeShortName === "string"
        ? row.exchangeShortName
        : null;
  const type = typeof row.type === "string" ? row.type.trim().toLowerCase() : null;

  if (!symbol || !name) {
    return null;
  }

  if (type && ["etf", "fund", "index", "crypto", "forex"].some((token) => type.includes(token))) {
    return null;
  }

  return {
    symbol,
    name,
    exchange: exchangeCandidate ? exchangeCandidate.trim() : null,
    type,
    normalized_name: normalizeName(name),
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string) {
  let attempt = 0;
  while (attempt < 5) {
    attempt += 1;
    try {
      const response = await fetch(url);
      if (!response.ok && RETRYABLE_STATUSES.has(response.status)) {
        await sleep(250 * attempt);
        continue;
      }
      return response;
    } catch {
      if (attempt >= 5) {
        throw new Error("Network error while fetching company list");
      }
      await sleep(250 * attempt);
    }
  }
  throw new Error("Failed to fetch company list after retries");
}

async function fetchCompanyRows(apiKey: string) {
  const stableResponse = await fetchWithRetry(`${STABLE_URL}?apikey=${encodeURIComponent(apiKey)}`);
  if (stableResponse.ok) {
    const payload = (await stableResponse.json()) as RawCompany[];
    return {
      endpointUsed: "stable" as const,
      rows: Array.isArray(payload) ? payload : [],
    };
  }

  const legacyResponse = await fetchWithRetry(`${LEGACY_URL}?apikey=${encodeURIComponent(apiKey)}`);
  if (!legacyResponse.ok) {
    throw new Error(`FMP company list failed (${legacyResponse.status})`);
  }
  const payload = (await legacyResponse.json()) as RawCompany[];
  return {
    endpointUsed: "legacy" as const,
    rows: Array.isArray(payload) ? payload : [],
  };
}

export async function refreshCompaniesMaster() {
  const startedAt = Date.now();
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    throw new Error("FMP_API_KEY missing");
  }

  const { endpointUsed, rows } = await fetchCompanyRows(apiKey);
  const normalizedRows = rows.map(toCompanyRow).filter((row): row is CompanyMasterRow => row !== null);

  let upsertedCount = 0;
  const chunkSize = 1000;
  for (let index = 0; index < normalizedRows.length; index += chunkSize) {
    const chunk = normalizedRows.slice(index, index + chunkSize);
    await execute("BEGIN");
    try {
      await batch(
        chunk.map((row) => ({
          sql: `INSERT INTO companies (symbol, name, exchange, type, normalized_name)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                  name = excluded.name,
                  exchange = excluded.exchange,
                  type = excluded.type,
                  normalized_name = excluded.normalized_name`,
          args: [row.symbol, row.name, row.exchange, row.type, row.normalized_name],
        }))
      );
      await execute("COMMIT");
      upsertedCount += chunk.length;
    } catch (error) {
      await execute("ROLLBACK");
      throw error;
    }
  }

  return {
    endpointUsed,
    fetchedCount: rows.length,
    upsertedCount,
    durationMs: Date.now() - startedAt,
  };
}

export async function searchCompaniesByName(queryText: string) {
  const q = queryText.trim();
  if (q.length < 2) {
    return [];
  }

  const normalized = normalizeName(q);
  const namePrefix = `${q.toLowerCase()}%`;
  const normalizedPrefix = `${normalized}%`;

  const rows = await query(
    `SELECT symbol, name, exchange, type
     FROM companies
     WHERE lower(name) LIKE ? OR normalized_name LIKE ?
     ORDER BY
       CASE WHEN lower(name) LIKE ? THEN 0 ELSE 1 END,
       CASE WHEN normalized_name LIKE ? THEN 0 ELSE 1 END,
       name ASC
     LIMIT 20`,
    [namePrefix, normalizedPrefix, namePrefix, normalizedPrefix]
  );

  return rows.map((row) => ({
    symbol: String(row.symbol),
    name: String(row.name),
    exchange: row.exchange ? String(row.exchange) : null,
    type: row.type ? String(row.type) : null,
  }));
}
