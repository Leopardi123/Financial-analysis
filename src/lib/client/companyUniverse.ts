export type UniverseCompany = {
  ticker: string;
  name: string;
};

export async function fetchCompanyUniverse(): Promise<UniverseCompany[]> {
  const response = await fetch("/api/company/list");
  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "Failed to load company universe");
  }
  const companies = Array.isArray(payload.companies) ? payload.companies : [];
  return companies
    .map((row: any) => ({
      ticker: String(row.ticker ?? "").trim().toUpperCase(),
      name: String(row.name ?? row.ticker ?? "").trim(),
    }))
    .filter((row: UniverseCompany) => row.ticker.length > 0);
}

export async function fetchUniverseSymbols(): Promise<string[]> {
  const companies = await fetchCompanyUniverse();
  return companies.map((item) => item.ticker);
}
