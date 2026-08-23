import { execute, query } from '../../../api/_db.js';

const TABLE = 'company_corporate_producer_json';

export type CompanyCorporateProducerSummary = {
  symbol: string;
  json_version: string;
  company_id: string;
  company_name: string;
  updated_at_utc: string;
};

export type CompanyCorporateProducerRow = CompanyCorporateProducerSummary & {
  raw_json: string;
  created_at_utc: string;
};

async function ensureTable(): Promise<void> {
  await execute(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      symbol TEXT PRIMARY KEY,
      json_version TEXT NOT NULL,
      company_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      raw_json TEXT NOT NULL,
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL
    )`,
  );
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export async function listCompanyCorporateProducerJson(): Promise<CompanyCorporateProducerSummary[]> {
  await ensureTable();
  const rows = await query(
    `SELECT symbol, json_version, company_id, company_name, updated_at_utc
     FROM ${TABLE}
     ORDER BY company_name ASC, symbol ASC`,
  ) as unknown as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    symbol: String(row.symbol ?? '').toUpperCase(),
    json_version: String(row.json_version ?? ''),
    company_id: String(row.company_id ?? ''),
    company_name: String(row.company_name ?? ''),
    updated_at_utc: String(row.updated_at_utc ?? ''),
  }));
}

export async function getCompanyCorporateProducerJson(symbol: string): Promise<CompanyCorporateProducerRow | null> {
  await ensureTable();
  const normalized = normalizeSymbol(symbol);
  const rows = await query(
    `SELECT symbol, json_version, company_id, company_name, raw_json, created_at_utc, updated_at_utc
     FROM ${TABLE}
     WHERE symbol = ?
     LIMIT 1`,
    [normalized],
  ) as unknown as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) return null;
  return {
    symbol: String(row.symbol ?? '').toUpperCase(),
    json_version: String(row.json_version ?? ''),
    company_id: String(row.company_id ?? ''),
    company_name: String(row.company_name ?? ''),
    raw_json: String(row.raw_json ?? ''),
    created_at_utc: String(row.created_at_utc ?? ''),
    updated_at_utc: String(row.updated_at_utc ?? ''),
  };
}

export async function upsertCompanyCorporateProducerJson(input: {
  symbol: string;
  json_version: string;
  company_id: string;
  company_name: string;
  raw_json: string;
}): Promise<CompanyCorporateProducerRow> {
  await ensureTable();
  const symbol = normalizeSymbol(input.symbol);
  const now = new Date().toISOString();
  const existing = await getCompanyCorporateProducerJson(symbol);

  if (existing) {
    const changed = existing.json_version !== input.json_version
      || existing.company_id !== input.company_id
      || existing.company_name !== input.company_name
      || existing.raw_json !== input.raw_json;
    if (changed) {
      await execute(
        `UPDATE ${TABLE}
         SET json_version = ?, company_id = ?, company_name = ?, raw_json = ?, updated_at_utc = ?
         WHERE symbol = ?`,
        [input.json_version, input.company_id, input.company_name, input.raw_json, now, symbol],
      );
    }
  } else {
    await execute(
      `INSERT INTO ${TABLE} (
        symbol, json_version, company_id, company_name, raw_json, created_at_utc, updated_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [symbol, input.json_version, input.company_id, input.company_name, input.raw_json, now, now],
    );
  }

  const saved = await getCompanyCorporateProducerJson(symbol);
  if (!saved) throw new Error('Failed to load saved corporate producer JSON');
  return saved;
}

export async function deleteCompanyCorporateProducerJson(symbol: string): Promise<void> {
  await ensureTable();
  await execute(`DELETE FROM ${TABLE} WHERE symbol = ?`, [normalizeSymbol(symbol)]);
}
