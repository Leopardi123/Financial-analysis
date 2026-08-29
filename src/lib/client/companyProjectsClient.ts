export type CompanyProjectSummary = {
  project_id: string;
  project_name: string | null;
  json_version: string;
  updated_at_utc: string;
  disabled?: boolean;
};

export type CompanyProjectRecord = {
  symbol: string;
  project_id: string;
  project_name: string | null;
  json_version: string;
  raw_json: Record<string, unknown>;
  updated_at_utc: string;
};

type CompanyProjectsResponse = {
  ok: boolean;
  symbol?: string;
  projects?: CompanyProjectSummary[];
  error?: string;
};

type CompanyProjectGetResponse = {
  ok: boolean;
  project?: CompanyProjectRecord;
  error?: string;
};

type CompanyProjectMutateResponse = {
  ok: boolean;
  symbol?: string;
  project_id?: string;
  updated_at_utc?: string;
  error?: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function listAllCompanyProjects(symbol: string): Promise<CompanyProjectSummary[]> {
  const response = await fetch(`/api/company-projects?symbol=${encodeURIComponent(symbol)}`);
  const body = await parseJsonResponse<CompanyProjectsResponse>(response);

  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? 'Failed to load company projects');
  }

  return Array.isArray(body.projects) ? body.projects : [];
}

/**
 * Canonical active-project list for normal application use. Projects marked
 * meta.disabled=true remain stored and editable, but are excluded from
 * Corporate, Compare Stocks and other consumers of the normal project list.
 */
export async function listCompanyProjects(symbol: string): Promise<CompanyProjectSummary[]> {
  const projects = await listAllCompanyProjects(symbol);
  return projects.filter((project) => project.disabled !== true);
}

export async function getCompanyProject(symbol: string, project_id: string): Promise<CompanyProjectRecord> {
  const query = new URLSearchParams({ symbol, project_id });
  const response = await fetch(`/api/company-projects/get?${query.toString()}`);
  const body = await parseJsonResponse<CompanyProjectGetResponse>(response);

  if (!response.ok || !body.ok || !body.project) {
    throw new Error(body.error ?? 'Failed to load project');
  }

  return body.project;
}

export async function upsertCompanyProject(input: {
  symbol: string;
  project_id: string;
  project_name: string | null;
  raw_json: Record<string, unknown>;
}): Promise<{ symbol: string; project_id: string; updated_at_utc: string }> {
  const response = await fetch('/api/company-projects/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const body = await parseJsonResponse<CompanyProjectMutateResponse>(response);

  if (!response.ok || !body.ok || !body.symbol || !body.project_id || !body.updated_at_utc) {
    throw new Error(body.error ?? 'Failed to save project');
  }

  return {
    symbol: body.symbol,
    project_id: body.project_id,
    updated_at_utc: body.updated_at_utc,
  };
}

export async function deleteCompanyProject(input: { symbol: string; project_id: string }): Promise<void> {
  const response = await fetch('/api/company-projects/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const body = await parseJsonResponse<CompanyProjectMutateResponse>(response);

  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? 'Failed to delete project');
  }
}

// backwards-compatible export used by existing dashboard code
export const getCompanyProjectsBySymbol = listCompanyProjects;
