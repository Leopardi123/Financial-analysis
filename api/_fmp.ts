const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3";

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
  const apiKey = requireFmpApiKey();
  if (!apiKey) {
    throw new Error("FMP_API_KEY missing");
  }
  const endpoint = STATEMENT_ENDPOINTS[statement];
  const fmpPeriod = period === "q" ? "quarter" : "annual";
  const search = new URLSearchParams({ period: fmpPeriod, apikey: apiKey });
  return `${FMP_BASE_URL}/${endpoint}/${encodeURIComponent(ticker)}?${search.toString()}`;
}

export async function fetchStatement(
  ticker: string,
  statement: StatementType,
  period: PeriodType,
) {
  const url = buildUrl(ticker, statement, period);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FMP request failed (${statement}/${period}) for ${ticker}: ${response.status}`);
  }
  return (await response.json()) as Array<Record<string, unknown>>;
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
