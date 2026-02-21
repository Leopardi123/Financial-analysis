const FMP_API_V3_BASE_URL = "https://financialmodelingprep.com/api/v3";
const FMP_STABLE_BASE_URL = "https://financialmodelingprep.com/stable";
const FMP_MIN_INTERVAL_MS = 220;
const FMP_MAX_RETRIES = 4;

let fmpQueue: Promise<unknown> = Promise.resolve();
let lastFmpRequestAt = 0;

const META_KEYS = new Set([
  "symbol",
  "date",
  "calendarYear",
  "period",
  "reportedCurrency",
  "cik",
  "fillingDate",
  "acceptedDate",
  "link",
  "finalLink",
]);

export type StatementType = "income" | "balance" | "cashflow";
export type PeriodType = "fy" | "q";

export type FinancialPoint = {
  ticker: string;
  statement: StatementType;
  period: PeriodType;
  fiscalDate: string;
  field: string;
  value: number;
  currency: string | null;
};

const STATEMENT_ENDPOINTS: Record<StatementType, string> = {
  income: "income-statement",
  balance: "balance-sheet-statement",
  cashflow: "cash-flow-statement",
};

export function requireFmpApiKey() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return null;
  }
  return apiKey;
}

function buildUrl(ticker: string, statement: StatementType, period: PeriodType) {
  return buildApiV3Url(`${STATEMENT_ENDPOINTS[statement]}/${encodeURIComponent(ticker)}`, {
    period: period === "q" ? "quarter" : "annual",
  });
}

function buildApiV3Url(path: string, query: Record<string, string | number | null | undefined> = {}) {
  const apiKey = requireFmpApiKey();
  if (!apiKey) {
    throw new Error("FMP_API_KEY missing");
  }
  const search = new URLSearchParams({ apikey: apiKey });
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) {
      search.set(key, String(value));
    }
  }
  return `${FMP_API_V3_BASE_URL}/${path.replace(/^\/+/, "")}?${search.toString()}`;
}

function buildStableUrl(path: string, query: Record<string, string | number | null | undefined> = {}) {
  const apiKey = requireFmpApiKey();
  if (!apiKey) {
    throw new Error("FMP_API_KEY missing");
  }
  const search = new URLSearchParams({ apikey: apiKey });
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) {
      search.set(key, String(value));
    }
  }
  return `${FMP_STABLE_BASE_URL}/${path.replace(/^\/+/, "")}?${search.toString()}`;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }
  const retryDate = Date.parse(value);
  if (Number.isNaN(retryDate)) {
    return null;
  }
  return Math.max(0, retryDate - Date.now());
}

function withFmpLimiter<T>(task: (waitMs: number) => Promise<T>) {
  const run = async () => {
    const now = Date.now();
    const waitMs = Math.max(0, lastFmpRequestAt + FMP_MIN_INTERVAL_MS - now);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastFmpRequestAt = Date.now();
    return task(waitMs);
  };
  const next = fmpQueue.then(run, run);
  fmpQueue = next.then(() => undefined, () => undefined);
  return next;
}

type FmpRequestOptions = {
  endpointForLogs?: string;
};

export async function fmpFetchJson<T>(url: string, options: FmpRequestOptions = {}): Promise<T> {
  const endpointForLogs = options.endpointForLogs ?? new URL(url).pathname;
  const debugEnabled = process.env.FMP_DEBUG === "1" || process.env.FMP_DEBUG === "true";

  for (let attempt = 1; attempt <= FMP_MAX_RETRIES + 1; attempt += 1) {
    const response = await withFmpLimiter(async (waitMs) => {
      const resp = await fetch(url);
      if (debugEnabled) {
        console.info("[fmp]", { endpoint: endpointForLogs, waitMs, attempt, status: resp.status });
      }
      return resp;
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status !== 429 || attempt > FMP_MAX_RETRIES) {
      throw new Error(`FMP request failed (${endpointForLogs}): ${response.status}`);
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    const backoffMs = retryAfterMs ?? 500 * (2 ** (attempt - 1));
    const jitterMs = Math.floor(Math.random() * 100);
    await new Promise((resolve) => setTimeout(resolve, backoffMs + jitterMs));
  }

  throw new Error(`FMP request failed (${endpointForLogs}): 429`);
}

export async function fetchStatement(
  ticker: string,
  statement: StatementType,
  period: PeriodType,
  options: { limit?: number } = {},
) {
  const url = buildUrl(ticker, statement, period);
  const requestUrl = options.limit ? `${url}&limit=${encodeURIComponent(String(options.limit))}` : url;
  return fmpFetchJson<Array<Record<string, unknown>>>(requestUrl, {
    endpointForLogs: `/${STATEMENT_ENDPOINTS[statement]}/${ticker}`,
  });
}

export async function fetchApiV3Json<T>(
  path: string,
  query: Record<string, string | number | null | undefined> = {},
) {
  const url = buildApiV3Url(path, query);
  return fmpFetchJson<T>(url, { endpointForLogs: `/${path.replace(/^\/+/, "")}` });
}

export async function fetchStableJson<T>(
  path: string,
  query: Record<string, string | number | null | undefined> = {},
) {
  const url = buildStableUrl(path, query);
  return fmpFetchJson<T>(url, { endpointForLogs: `/stable/${path.replace(/^\/+/, "")}` });
}

export function normalizeFinancialPoints(
  ticker: string,
  statement: StatementType,
  period: PeriodType,
  rows: Array<Record<string, unknown>>,
): FinancialPoint[] {
  const points: FinancialPoint[] = [];

  for (const row of rows) {
    const fiscalDate = String(row.date ?? "");
    if (!fiscalDate) {
      continue;
    }
    const currency = typeof row.reportedCurrency === "string" ? row.reportedCurrency : null;

    for (const [key, value] of Object.entries(row)) {
      if (META_KEYS.has(key)) {
        continue;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        points.push({
          ticker,
          statement,
          period,
          fiscalDate,
          field: key,
          value,
          currency,
        });
      }
    }
  }

  return points;
}
