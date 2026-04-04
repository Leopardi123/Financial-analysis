import { execute, query } from "../../../api/_db.js";
import { tables } from "../../../api/_migrate.js";
import type { MappingSource, PortfolioPositionRecord } from "./types.js";

type PositionInput = {
  portfolio_id: string;
  symbol: string;
  company_id: number | null;
  instrument_id: string | null;
  display_name: string | null;
  shares: number;
  avg_cost: number | null;
  market_value: number | null;
  entry_date: string | null;
  asset_type: string;
  thesis: string | null;
  notes: string | null;
  manual_sector_id: number | null;
  manual_subsector_id: number | null;
  manual_commodity_id: string | null;
  mapping_source: MappingSource;
  mapping_override_active: boolean;
  active_position: boolean;
  exited_at: string | null;
  manual_price: number | null;
  currency: string | null;
};

function toNullableNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function rowToPosition(row: any): PortfolioPositionRecord {
  const inferredSector = toNullableNumber(row.inferred_sector_id);
  const inferredSubsector = toNullableNumber(row.inferred_subsector_id);
  const inferredCommodity = row.inferred_commodity_id == null ? null : String(row.inferred_commodity_id);
  const manualSector = toNullableNumber(row.manual_sector_id);
  const manualSubsector = toNullableNumber(row.manual_subsector_id);
  const manualCommodity = row.manual_commodity_id == null ? null : String(row.manual_commodity_id);
  const overrideActive = Number(row.mapping_override_active ?? 0) === 1;

  return {
    id: Number(row.id ?? 0),
    portfolio_id: String(row.portfolio_id ?? ""),
    symbol: String(row.symbol ?? "").toUpperCase(),
    company_id: toNullableNumber(row.company_id),
    instrument_id: row.instrument_id == null ? null : String(row.instrument_id),
    display_name: row.display_name == null ? null : String(row.display_name),
    shares: Number(row.shares ?? 0),
    avg_cost: toNullableNumber(row.avg_cost),
    entry_date: row.entry_date == null ? null : String(row.entry_date),
    asset_type: String(row.asset_type ?? "major") as PortfolioPositionRecord["asset_type"],
    thesis: row.thesis == null ? null : String(row.thesis),
    notes: row.notes == null ? null : String(row.notes),
    manual_sector_id: manualSector,
    manual_subsector_id: manualSubsector,
    manual_commodity_id: manualCommodity,
    mapping_source: String(row.mapping_source ?? "inherited") as MappingSource,
    mapping_override_active: overrideActive,
    active_position: Number(row.active_position ?? 1) === 1,
    exited_at: row.exited_at == null ? null : String(row.exited_at),
    manual_price: toNullableNumber(row.manual_price),
    currency: row.currency == null ? null : String(row.currency),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    inferred_sector_id: inferredSector,
    inferred_subsector_id: inferredSubsector,
    inferred_commodity_id: inferredCommodity,
    final_sector_id: overrideActive ? (manualSector ?? inferredSector) : inferredSector,
    final_subsector_id: overrideActive ? (manualSubsector ?? inferredSubsector) : inferredSubsector,
    final_commodity_id: overrideActive ? (manualCommodity ?? inferredCommodity) : inferredCommodity,
  };
}

export async function listPortfolioPositions(portfolioId: string): Promise<PortfolioPositionRecord[]> {
  const rows = await query(
    `SELECT p.*,
            map.sector_id AS inferred_sector_id,
            map.subsector_id AS inferred_subsector_id,
            commodity.commodity AS inferred_commodity_id
     FROM ${tables.portfolioPositions} p
     LEFT JOIN ${tables.companySectorMap} map ON map.company_id = p.company_id
     LEFT JOIN ${tables.companyCommodityOverride} commodity ON commodity.company_id = p.company_id
     WHERE p.portfolio_id = ?
     ORDER BY p.active_position DESC, p.updated_at DESC, p.id DESC`,
    [portfolioId]
  );
  return rows.map((row) => rowToPosition(row));
}

export async function createPortfolioPosition(input: PositionInput): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO ${tables.portfolioPositions} (
      portfolio_id, symbol, company_id, instrument_id, display_name,
      shares, avg_cost, entry_date, asset_type,
      thesis, notes,
      manual_sector_id, manual_subsector_id, manual_commodity_id,
      mapping_source, mapping_override_active,
      active_position, exited_at,
      manual_price, currency,
      created_at, updated_at,
      market_value, as_of_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.portfolio_id,
      input.symbol.toUpperCase(),
      input.company_id,
      input.instrument_id,
      input.display_name,
      input.shares,
      input.avg_cost,
      input.entry_date,
      input.asset_type,
      input.thesis,
      input.notes,
      input.manual_sector_id,
      input.manual_subsector_id,
      input.manual_commodity_id,
      input.mapping_source,
      input.mapping_override_active ? 1 : 0,
      input.active_position ? 1 : 0,
      input.exited_at,
      input.manual_price,
      input.currency,
      now,
      now,
      input.market_value ?? (input.manual_price !== null && input.manual_price > 0 ? input.manual_price * input.shares : null),
      now.slice(0, 10),
    ]
  );
}

export async function updatePortfolioPosition(id: number, input: PositionInput): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    `UPDATE ${tables.portfolioPositions}
     SET portfolio_id = ?,
         symbol = ?,
         company_id = ?,
         instrument_id = ?,
         display_name = ?,
         shares = ?,
         avg_cost = ?,
         entry_date = ?,
         asset_type = ?,
         thesis = ?,
         notes = ?,
         manual_sector_id = ?,
         manual_subsector_id = ?,
         manual_commodity_id = ?,
         mapping_source = ?,
         mapping_override_active = ?,
         active_position = ?,
         exited_at = ?,
         manual_price = ?,
         currency = ?,
         market_value = ?,
         as_of_date = ?,
         updated_at = ?
      WHERE id = ?`,
    [
      input.portfolio_id,
      input.symbol.toUpperCase(),
      input.company_id,
      input.instrument_id,
      input.display_name,
      input.shares,
      input.avg_cost,
      input.entry_date,
      input.asset_type,
      input.thesis,
      input.notes,
      input.manual_sector_id,
      input.manual_subsector_id,
      input.manual_commodity_id,
      input.mapping_source,
      input.mapping_override_active ? 1 : 0,
      input.active_position ? 1 : 0,
      input.exited_at,
      input.manual_price,
      input.currency,
      input.market_value ?? (input.manual_price !== null && input.manual_price > 0 ? input.manual_price * input.shares : null),
      now.slice(0, 10),
      now,
      id,
    ]
  );
}

export async function deactivatePortfolioPosition(id: number): Promise<void> {
  const now = new Date().toISOString();
  await execute(
    `UPDATE ${tables.portfolioPositions}
     SET active_position = 0,
         exited_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [now.slice(0, 10), now, id]
  );
}
