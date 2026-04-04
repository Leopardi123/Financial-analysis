export type UniverseCompany = {
  ticker: string;
  name: string;
};

export async function fetchCompanyUniverse(options?: { q?: string; limit?: number; slim?: boolean }): Promise<UniverseCompany[]> {
  const params = new URLSearchParams();
  if (options?.q) params.set("q", options.q);
  if (typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    params.set("limit", String(Math.floor(options.limit)));
  }
  if (options?.slim) params.set("slim", "1");
  const response = await fetch(`/api/company/list${params.toString() ? `?${params.toString()}` : ""}`);
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error?.message ?? payload?.error ?? "Failed to load company universe");
  }
  const companies = Array.isArray(payload.companies)
    ? payload.companies
    : Array.isArray(payload.tickers)
      ? payload.tickers.map((ticker: string) => ({ ticker, name: ticker }))
      : [];
  return companies
    .map((row: any) => ({
      ticker: String(row.ticker ?? "").trim().toUpperCase(),
      name: String(row.name ?? row.ticker ?? "").trim(),
    }))
    .filter((row: UniverseCompany) => row.ticker.length > 0);
}

export async function fetchUniverseSymbols(options?: { q?: string; limit?: number }): Promise<string[]> {
  const companies = await fetchCompanyUniverse({ ...options, slim: true });
  return companies.map((item) => item.ticker);
}
