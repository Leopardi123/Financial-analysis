import type { MappingSource, PortfolioAssetType } from "./types.js";

const ASSET_TYPES: PortfolioAssetType[] = ["major", "royalty", "junior", "growth", "defensive", "cash_proxy"];
const MAPPING_SOURCES: MappingSource[] = ["inherited", "portfolio_override", "portfolio_completed"];

function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseIntOrNull(value: unknown): number | null {
  const num = parseNumber(value);
  if (num === null) return null;
  return Number.isInteger(num) ? num : null;
}

function parseDateOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const dt = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== text) return null;
  return text;
}

export function normalizePositionPayload(payload: Record<string, unknown>) {
  const errors: string[] = [];

  const portfolioId = String(payload.portfolio_id ?? "").trim();
  const symbol = String(payload.symbol ?? "").trim().toUpperCase();
  const shares = parseNumber(payload.shares);
  const avgCost = parseNumber(payload.avg_cost);
  const entryDate = parseDateOrNull(payload.entry_date);
  const assetType = String(payload.asset_type ?? "").trim() as PortfolioAssetType;
  const mappingSource = String(payload.mapping_source ?? "inherited") as MappingSource;
  const overrideActive = payload.mapping_override_active === true || Number(payload.mapping_override_active ?? 0) === 1;

  if (!portfolioId) errors.push("portfolio_id is required");
  if (!symbol) errors.push("symbol is required");
  if (shares === null || shares <= 0) errors.push("shares must be numeric > 0");
  if (!ASSET_TYPES.includes(assetType)) errors.push(`asset_type must be one of: ${ASSET_TYPES.join(", ")}`);
  if (payload.entry_date !== undefined && payload.entry_date !== null && payload.entry_date !== "" && !entryDate) {
    errors.push("entry_date must be a valid date (YYYY-MM-DD)");
  }
  if (avgCost !== null && avgCost < 0) errors.push("avg_cost must be numeric >= 0");
  if (!MAPPING_SOURCES.includes(mappingSource)) errors.push("mapping_source is invalid");

  const manualSectorId = parseIntOrNull(payload.manual_sector_id);
  const manualSubsectorId = parseIntOrNull(payload.manual_subsector_id);
  const manualCommodity = payload.manual_commodity_id == null || payload.manual_commodity_id === ""
    ? null
    : String(payload.manual_commodity_id).trim().toLowerCase();

  if (overrideActive && payload.manual_sector_id !== undefined && payload.manual_sector_id !== null && manualSectorId === null) {
    errors.push("manual_sector_id must be a valid canonical sector row id");
  }
  if (overrideActive && payload.manual_subsector_id !== undefined && payload.manual_subsector_id !== null && manualSubsectorId === null) {
    errors.push("manual_subsector_id must be a valid canonical subsector row id");
  }

  if (errors.length > 0) {
    return { ok: false as const, errors };
  }

  return {
    ok: true as const,
    value: {
      portfolio_id: portfolioId,
      symbol,
      company_id: parseIntOrNull(payload.company_id),
      instrument_id: payload.instrument_id == null || payload.instrument_id === "" ? null : String(payload.instrument_id).trim(),
      display_name: payload.display_name == null || payload.display_name === "" ? null : String(payload.display_name).trim(),
      shares: shares as number,
      avg_cost: avgCost,
      entry_date: entryDate,
      asset_type: assetType,
      thesis: payload.thesis == null || payload.thesis === "" ? null : String(payload.thesis),
      notes: payload.notes == null || payload.notes === "" ? null : String(payload.notes),
      manual_sector_id: manualSectorId,
      manual_subsector_id: manualSubsectorId,
      manual_commodity_id: manualCommodity,
      mapping_source: mappingSource,
      mapping_override_active: overrideActive,
      active_position: payload.active_position === undefined ? true : payload.active_position === true || Number(payload.active_position) === 1,
      exited_at: parseDateOrNull(payload.exited_at),
      manual_price: parseNumber(payload.manual_price),
      currency: payload.currency == null || payload.currency === "" ? null : String(payload.currency).trim().toUpperCase(),
    },
  };
}
