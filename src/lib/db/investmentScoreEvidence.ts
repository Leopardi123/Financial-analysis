import { execute, query } from '../../../api/_db.js';
import type { ManagementEvidence, OptionalityEvidence } from '../investmentScore/types.ts';

const COMPANY_TABLE = 'investment_score_company_evidence_v1';
const PROJECT_TABLE = 'investment_score_project_evidence_v1';

let schemaReady = false;

async function ensureInvestmentScoreEvidenceSchema(): Promise<void> {
  if (schemaReady) return;
  await execute(
    `CREATE TABLE IF NOT EXISTS ${COMPANY_TABLE} (
      symbol TEXT PRIMARY KEY,
      management_json TEXT NOT NULL,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL
    )`,
  );
  await execute(
    `CREATE TABLE IF NOT EXISTS ${PROJECT_TABLE} (
      symbol TEXT NOT NULL,
      project_id TEXT NOT NULL,
      optionality_json TEXT NOT NULL,
      fatal_flaw INTEGER,
      fatal_flaw_note TEXT,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      PRIMARY KEY (symbol, project_id)
    )`,
  );
  schemaReady = true;
}

export type CompanyInvestmentScoreEvidenceRow = {
  symbol: string;
  management: ManagementEvidence;
  created_at_utc: string;
  updated_at_utc: string;
};

export type ProjectInvestmentScoreEvidenceRow = {
  symbol: string;
  project_id: string;
  optionality: OptionalityEvidence;
  fatal_flaw: boolean | null;
  fatal_flaw_note: string | null;
  created_at_utc: string;
  updated_at_utc: string;
};

export async function getCompanyInvestmentScoreEvidence(symbol: string): Promise<CompanyInvestmentScoreEvidenceRow | null> {
  await ensureInvestmentScoreEvidenceSchema();
  const rows = await query(
    `SELECT symbol, management_json, created_at_utc, updated_at_utc
     FROM ${COMPANY_TABLE}
     WHERE symbol = ?
     LIMIT 1`,
    [symbol],
  ) as unknown as Array<{ symbol: string; management_json: string; created_at_utc: string; updated_at_utc: string }>;
  const row = rows[0];
  if (!row) return null;
  return {
    symbol: String(row.symbol),
    management: JSON.parse(String(row.management_json)) as ManagementEvidence,
    created_at_utc: String(row.created_at_utc),
    updated_at_utc: String(row.updated_at_utc),
  };
}

export async function upsertCompanyInvestmentScoreEvidence(input: {
  symbol: string;
  management: ManagementEvidence;
}): Promise<CompanyInvestmentScoreEvidenceRow> {
  await ensureInvestmentScoreEvidenceSchema();
  const now = new Date().toISOString();
  const managementJson = JSON.stringify(input.management);
  const existing = await getCompanyInvestmentScoreEvidence(input.symbol);
  if (existing) {
    await execute(
      `UPDATE ${COMPANY_TABLE}
       SET management_json = ?, updated_at_utc = ?
       WHERE symbol = ?`,
      [managementJson, now, input.symbol],
    );
  } else {
    await execute(
      `INSERT INTO ${COMPANY_TABLE} (symbol, management_json, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?)`,
      [input.symbol, managementJson, now, now],
    );
  }
  const saved = await getCompanyInvestmentScoreEvidence(input.symbol);
  if (!saved) throw new Error('Failed to load saved company Investment Score evidence');
  return saved;
}

export async function getProjectInvestmentScoreEvidence(
  symbol: string,
  projectId: string,
): Promise<ProjectInvestmentScoreEvidenceRow | null> {
  await ensureInvestmentScoreEvidenceSchema();
  const rows = await query(
    `SELECT symbol, project_id, optionality_json, fatal_flaw, fatal_flaw_note, created_at_utc, updated_at_utc
     FROM ${PROJECT_TABLE}
     WHERE symbol = ? AND project_id = ?
     LIMIT 1`,
    [symbol, projectId],
  ) as unknown as Array<{
    symbol: string;
    project_id: string;
    optionality_json: string;
    fatal_flaw: number | null;
    fatal_flaw_note: string | null;
    created_at_utc: string;
    updated_at_utc: string;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    symbol: String(row.symbol),
    project_id: String(row.project_id),
    optionality: JSON.parse(String(row.optionality_json)) as OptionalityEvidence,
    fatal_flaw: row.fatal_flaw === null || row.fatal_flaw === undefined ? null : Number(row.fatal_flaw) === 1,
    fatal_flaw_note: row.fatal_flaw_note === null || row.fatal_flaw_note === undefined ? null : String(row.fatal_flaw_note),
    created_at_utc: String(row.created_at_utc),
    updated_at_utc: String(row.updated_at_utc),
  };
}

export async function upsertProjectInvestmentScoreEvidence(input: {
  symbol: string;
  project_id: string;
  optionality: OptionalityEvidence;
  fatal_flaw: boolean | null;
  fatal_flaw_note?: string | null;
}): Promise<ProjectInvestmentScoreEvidenceRow> {
  await ensureInvestmentScoreEvidenceSchema();
  const now = new Date().toISOString();
  const optionalityJson = JSON.stringify(input.optionality);
  const fatalFlawDb = input.fatal_flaw === null ? null : input.fatal_flaw ? 1 : 0;
  const existing = await getProjectInvestmentScoreEvidence(input.symbol, input.project_id);
  if (existing) {
    await execute(
      `UPDATE ${PROJECT_TABLE}
       SET optionality_json = ?, fatal_flaw = ?, fatal_flaw_note = ?, updated_at_utc = ?
       WHERE symbol = ? AND project_id = ?`,
      [optionalityJson, fatalFlawDb, input.fatal_flaw_note ?? null, now, input.symbol, input.project_id],
    );
  } else {
    await execute(
      `INSERT INTO ${PROJECT_TABLE}
       (symbol, project_id, optionality_json, fatal_flaw, fatal_flaw_note, created_at_utc, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.symbol, input.project_id, optionalityJson, fatalFlawDb, input.fatal_flaw_note ?? null, now, now],
    );
  }
  const saved = await getProjectInvestmentScoreEvidence(input.symbol, input.project_id);
  if (!saved) throw new Error('Failed to load saved project Investment Score evidence');
  return saved;
}
