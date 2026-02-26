import { execute, query } from '../../../api/_db.js';

export type CompanyProjectSummary = {
  project_id: string;
  project_name: string | null;
  json_version: string;
  updated_at_utc: string;
};

export type CompanyProjectRow = {
  id: string;
  symbol: string;
  project_id: string;
  project_name: string | null;
  json_version: string;
  raw_json: string;
  created_at_utc: string;
  updated_at_utc: string;
};

export type UpsertCompanyProjectInput = {
  symbol: string;
  project_id: string;
  project_name?: string | null;
  json_version: string;
  raw_json: string;
};

function makeId(symbol: string, project_id: string): string {
  return `sym:${symbol}|pid:${project_id}`;
}

export async function listCompanyProjects(symbol: string): Promise<CompanyProjectSummary[]> {
  const rows = await query(
    `SELECT project_id, project_name, json_version, updated_at_utc
     FROM company_projects
     WHERE symbol = ?
     ORDER BY updated_at_utc DESC, project_id ASC`,
    [symbol],
  ) as unknown as CompanyProjectSummary[];

  return rows.map((row) => ({
    project_id: String(row.project_id),
    project_name: row.project_name === null || row.project_name === undefined ? null : String(row.project_name),
    json_version: String(row.json_version),
    updated_at_utc: String(row.updated_at_utc),
  }));
}

export async function getCompanyProject(symbol: string, project_id: string): Promise<CompanyProjectRow | null> {
  const rows = await query(
    `SELECT id, symbol, project_id, project_name, json_version, raw_json, created_at_utc, updated_at_utc
     FROM company_projects
     WHERE symbol = ? AND project_id = ?
     LIMIT 1`,
    [symbol, project_id],
  ) as unknown as CompanyProjectRow[];

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    symbol: String(row.symbol),
    project_id: String(row.project_id),
    project_name: row.project_name === null || row.project_name === undefined ? null : String(row.project_name),
    json_version: String(row.json_version),
    raw_json: String(row.raw_json),
    created_at_utc: String(row.created_at_utc),
    updated_at_utc: String(row.updated_at_utc),
  };
}

export async function upsertCompanyProject(input: UpsertCompanyProjectInput): Promise<CompanyProjectRow> {
  const now = new Date().toISOString();
  const id = makeId(input.symbol, input.project_id);
  const existing = await getCompanyProject(input.symbol, input.project_id);

  if (existing) {
    const shouldWrite =
      existing.project_name !== (input.project_name ?? null)
      || existing.json_version !== input.json_version
      || existing.raw_json !== input.raw_json;

    if (shouldWrite) {
      await execute(
        `UPDATE company_projects
         SET project_name = ?,
             json_version = ?,
             raw_json = ?,
             updated_at_utc = ?
         WHERE symbol = ? AND project_id = ?`,
        [input.project_name ?? null, input.json_version, input.raw_json, now, input.symbol, input.project_id],
      );
      const updated = await getCompanyProject(input.symbol, input.project_id);
      if (!updated) {
        throw new Error('Failed to load updated project row');
      }
      return updated;
    }

    return existing;
  }

  await execute(
    `INSERT INTO company_projects (
      id,
      symbol,
      project_id,
      project_name,
      json_version,
      raw_json,
      created_at_utc,
      updated_at_utc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.symbol, input.project_id, input.project_name ?? null, input.json_version, input.raw_json, now, now],
  );

  const inserted = await getCompanyProject(input.symbol, input.project_id);
  if (!inserted) {
    throw new Error('Failed to load inserted project row');
  }

  return inserted;
}

export async function deleteCompanyProject(symbol: string, project_id: string): Promise<void> {
  await execute(
    `DELETE FROM company_projects
     WHERE symbol = ? AND project_id = ?`,
    [symbol, project_id],
  );
}
