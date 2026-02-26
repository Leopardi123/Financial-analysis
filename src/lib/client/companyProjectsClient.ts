export type CompanyProjectSummary = {
  project_id: string;
  project_name: string | null;
  json_version: string;
  updated_at_utc: string;
};

type CompanyProjectsResponse = {
  ok: boolean;
  symbol?: string;
  projects?: CompanyProjectSummary[];
  error?: string;
};

export async function getCompanyProjectsBySymbol(symbol: string): Promise<CompanyProjectSummary[]> {
  const response = await fetch(`/api/company-projects?symbol=${encodeURIComponent(symbol)}`);
  const body = (await response.json()) as CompanyProjectsResponse;

  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? 'Failed to load company projects');
  }

  return Array.isArray(body.projects) ? body.projects : [];
}
