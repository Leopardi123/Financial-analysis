import { getCompanyProject, listCompanyProjects } from '../db/companyProjects.ts';

export async function loadProjectsForSymbol(symbol: string): Promise<Array<{ projectId: string; rawJson: Record<string, unknown> }>> {
  const projects = await listCompanyProjects(symbol);
  const loaded: Array<{ projectId: string; rawJson: Record<string, unknown> }> = [];

  for (const project of projects) {
    const row = await getCompanyProject(symbol, project.project_id);
    if (!row) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.raw_json);
    } catch {
      throw new Error(`Corrupt stored project JSON for symbol=${symbol} project_id=${row.project_id}`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Corrupt stored project JSON for symbol=${symbol} project_id=${row.project_id}`);
    }

    loaded.push({
      projectId: row.project_id,
      rawJson: parsed as Record<string, unknown>,
    });
  }

  return loaded;
}
