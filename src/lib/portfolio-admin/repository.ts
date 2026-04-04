import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import type { PortfolioAdminConfig } from "./types.js";

const TABLE = tables.portfolioAdminConfig;

function asBool(value: unknown): boolean {
  return Number(value ?? 0) === 1;
}

function asNullableBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return Number(value) === 1;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function rowToPortfolioConfig(row: any): PortfolioAdminConfig {
  return {
    portfolio_id: String(row.portfolio_id ?? ""),
    portfolio_name: String(row.portfolio_name ?? ""),
    portfolio_type: String(row.portfolio_type ?? "") as PortfolioAdminConfig["portfolio_type"],
    active: asBool(row.active),
    visible_in_overview: asBool(row.visible_in_overview),
    included_in_total_portfolio: asBool(row.included_in_total_portfolio),
    sort_order: Number(row.sort_order ?? 0),
    target_weight_pct: Number(row.target_weight_pct ?? 0),
    min_weight_pct: Number(row.min_weight_pct ?? 0),
    max_weight_pct: Number(row.max_weight_pct ?? 0),
    strategic_risk_level: String(row.strategic_risk_level ?? "") as PortfolioAdminConfig["strategic_risk_level"],
    hedging_allowed: asBool(row.hedging_allowed),
    max_hedge_pct: asNullableNumber(row.max_hedge_pct),
    rebalance_mode: String(row.rebalance_mode ?? "") as PortfolioAdminConfig["rebalance_mode"],
    role_description: String(row.role_description ?? ""),
    long_term_purpose: row.long_term_purpose == null ? null : String(row.long_term_purpose),
    notes: row.notes == null ? null : String(row.notes),
    allowed_hedge_types_json: String(row.allowed_hedge_types_json ?? "[]"),
    hedge_purpose_json: String(row.hedge_purpose_json ?? "[]"),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    rebalance_priority: asNullableNumber(row.rebalance_priority),
    max_single_position_pct: asNullableNumber(row.max_single_position_pct),
    max_sector_concentration_pct: asNullableNumber(row.max_sector_concentration_pct),
    max_commodity_concentration_pct: asNullableNumber(row.max_commodity_concentration_pct),
    max_junior_exposure_pct: asNullableNumber(row.max_junior_exposure_pct),
    max_illiquid_exposure_pct: asNullableNumber(row.max_illiquid_exposure_pct),
    analyst_override_allowed: asNullableBool(row.analyst_override_allowed),
    analyst_override_note: row.analyst_override_note == null ? null : String(row.analyst_override_note),
    override_expiry_date: row.override_expiry_date == null ? null : String(row.override_expiry_date),
  };
}

export async function listPortfolioConfigs(): Promise<PortfolioAdminConfig[]> {
  const rows = await query(`SELECT * FROM ${TABLE} ORDER BY sort_order ASC, portfolio_id ASC`);
  return rows.map((row) => rowToPortfolioConfig(row));
}

export async function getPortfolioConfig(portfolioId: string): Promise<PortfolioAdminConfig | null> {
  const rows = await query(`SELECT * FROM ${TABLE} WHERE portfolio_id = ? LIMIT 1`, [portfolioId]);
  if (rows.length === 0) return null;
  return rowToPortfolioConfig(rows[0]);
}

export async function insertPortfolioConfig(config: PortfolioAdminConfig): Promise<void> {
  await execute(
    `INSERT INTO ${TABLE} (
      portfolio_id, portfolio_name, portfolio_type, active, visible_in_overview, included_in_total_portfolio, sort_order,
      target_weight_pct, min_weight_pct, max_weight_pct, strategic_risk_level, hedging_allowed, max_hedge_pct,
      rebalance_mode, role_description, long_term_purpose, notes,
      allowed_hedge_types_json, hedge_purpose_json,
      created_at, updated_at,
      rebalance_priority, max_single_position_pct, max_sector_concentration_pct,
      max_commodity_concentration_pct, max_junior_exposure_pct, max_illiquid_exposure_pct,
      analyst_override_allowed, analyst_override_note, override_expiry_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      config.portfolio_id,
      config.portfolio_name,
      config.portfolio_type,
      config.active ? 1 : 0,
      config.visible_in_overview ? 1 : 0,
      config.included_in_total_portfolio ? 1 : 0,
      config.sort_order,
      config.target_weight_pct,
      config.min_weight_pct,
      config.max_weight_pct,
      config.strategic_risk_level,
      config.hedging_allowed ? 1 : 0,
      config.max_hedge_pct ?? null,
      config.rebalance_mode,
      config.role_description,
      config.long_term_purpose ?? null,
      config.notes ?? null,
      config.allowed_hedge_types_json,
      config.hedge_purpose_json,
      config.created_at,
      config.updated_at,
      config.rebalance_priority ?? null,
      config.max_single_position_pct ?? null,
      config.max_sector_concentration_pct ?? null,
      config.max_commodity_concentration_pct ?? null,
      config.max_junior_exposure_pct ?? null,
      config.max_illiquid_exposure_pct ?? null,
      config.analyst_override_allowed == null ? null : config.analyst_override_allowed ? 1 : 0,
      config.analyst_override_note ?? null,
      config.override_expiry_date ?? null,
    ]
  );
}

export async function updatePortfolioConfig(config: PortfolioAdminConfig): Promise<void> {
  await execute(
    `UPDATE ${TABLE}
     SET portfolio_name = ?,
         portfolio_type = ?,
         active = ?,
         visible_in_overview = ?,
         included_in_total_portfolio = ?,
         sort_order = ?,
         target_weight_pct = ?,
         min_weight_pct = ?,
         max_weight_pct = ?,
         strategic_risk_level = ?,
         hedging_allowed = ?,
         max_hedge_pct = ?,
         rebalance_mode = ?,
         role_description = ?,
         long_term_purpose = ?,
         notes = ?,
         allowed_hedge_types_json = ?,
         hedge_purpose_json = ?,
         updated_at = ?,
         rebalance_priority = ?,
         max_single_position_pct = ?,
         max_sector_concentration_pct = ?,
         max_commodity_concentration_pct = ?,
         max_junior_exposure_pct = ?,
         max_illiquid_exposure_pct = ?,
         analyst_override_allowed = ?,
         analyst_override_note = ?,
         override_expiry_date = ?
     WHERE portfolio_id = ?`,
    [
      config.portfolio_name,
      config.portfolio_type,
      config.active ? 1 : 0,
      config.visible_in_overview ? 1 : 0,
      config.included_in_total_portfolio ? 1 : 0,
      config.sort_order,
      config.target_weight_pct,
      config.min_weight_pct,
      config.max_weight_pct,
      config.strategic_risk_level,
      config.hedging_allowed ? 1 : 0,
      config.max_hedge_pct,
      config.rebalance_mode,
      config.role_description,
      config.long_term_purpose,
      config.notes,
      config.allowed_hedge_types_json,
      config.hedge_purpose_json,
      config.updated_at,
      config.rebalance_priority,
      config.max_single_position_pct,
      config.max_sector_concentration_pct,
      config.max_commodity_concentration_pct,
      config.max_junior_exposure_pct,
      config.max_illiquid_exposure_pct,
      config.analyst_override_allowed == null ? null : config.analyst_override_allowed ? 1 : 0,
      config.analyst_override_note,
      config.override_expiry_date,
      config.portfolio_id,
    ]
  );
}
