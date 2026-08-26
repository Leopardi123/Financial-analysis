import { execute, query } from '../../../api/_db.js';
import type { SnapshotRequest } from '../api/validateSnapshotRequest.ts';

export type CorporateFinancingPreferences = {
  symbol: string;
  financingPlan: SnapshotRequest['financingPlan'];
  financingPlanByProject: SnapshotRequest['financingPlanByProject'];
  extraShares: number;
  updatedAtUtc: string;
};

async function ensureTable(): Promise<void> {
  await execute(`CREATE TABLE IF NOT EXISTS corporate_financing_preferences (
    symbol TEXT PRIMARY KEY,
    financing_plan_json TEXT,
    financing_plan_by_project_json TEXT,
    extra_shares INTEGER NOT NULL DEFAULT 0,
    updated_at_utc TEXT NOT NULL
  )`);
}

function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export async function getCorporateFinancingPreferences(symbolRaw: string): Promise<CorporateFinancingPreferences | null> {
  const symbol = symbolRaw.trim().toUpperCase();
  if (!symbol) return null;
  await ensureTable();
  const rows = await query(
    `SELECT symbol, financing_plan_json, financing_plan_by_project_json, extra_shares, updated_at_utc
     FROM corporate_financing_preferences
     WHERE symbol = ?
     LIMIT 1`,
    [symbol],
  ) as unknown as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  const extraSharesRaw = Number(row.extra_shares ?? 0);
  return {
    symbol: String(row.symbol ?? symbol),
    financingPlan: parseJson<SnapshotRequest['financingPlan']>(row.financing_plan_json),
    financingPlanByProject: parseJson<SnapshotRequest['financingPlanByProject']>(row.financing_plan_by_project_json),
    extraShares: Number.isSafeInteger(extraSharesRaw) && extraSharesRaw >= 0 ? extraSharesRaw : 0,
    updatedAtUtc: String(row.updated_at_utc ?? ''),
  };
}

export async function upsertCorporateFinancingPreferences(input: {
  symbol: string;
  financingPlan?: SnapshotRequest['financingPlan'];
  financingPlanByProject?: SnapshotRequest['financingPlanByProject'];
  extraShares?: number;
}): Promise<CorporateFinancingPreferences> {
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) throw new Error('symbol is required');
  await ensureTable();
  const existing = await getCorporateFinancingPreferences(symbol);
  const extraShares = Number.isSafeInteger(input.extraShares) && (input.extraShares as number) >= 0
    ? input.extraShares as number
    : existing?.extraShares ?? 0;
  const financingPlan = input.financingPlan ?? existing?.financingPlan;
  const financingPlanByProject = input.financingPlanByProject ?? existing?.financingPlanByProject;
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO corporate_financing_preferences (
       symbol, financing_plan_json, financing_plan_by_project_json, extra_shares, updated_at_utc
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
       financing_plan_json = excluded.financing_plan_json,
       financing_plan_by_project_json = excluded.financing_plan_by_project_json,
       extra_shares = excluded.extra_shares,
       updated_at_utc = excluded.updated_at_utc`,
    [
      symbol,
      financingPlan ? JSON.stringify(financingPlan) : null,
      financingPlanByProject ? JSON.stringify(financingPlanByProject) : null,
      extraShares,
      now,
    ],
  );

  return {
    symbol,
    financingPlan,
    financingPlanByProject,
    extraShares,
    updatedAtUtc: now,
  };
}
